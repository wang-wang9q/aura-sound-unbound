/* Original synthesized listening scenes for the AURA concept page. */
(function () {
  'use strict';

  var LOOP_SECONDS = 16;
  var LOOK_AHEAD = 0.28;
  var DEFAULT_VOLUME = 0.6;
  var VALID_SCENES = ['studio', 'outdoor', 'night'];
  var listeners = new Set();
  var voices = new Set();
  var context = null;
  var master = null;
  var compressor = null;
  var scheduler = null;
  var suspendTimer = null;
  var playing = false;
  var scene = 'studio';
  var volume = DEFAULT_VOLUME;
  var lastError = null;
  var generation = 0;
  var loopStart = 0;
  var eventIndex = 0;
  var score = [];

  function state() {
    var value = { playing: playing, scene: scene, volume: volume };
    if (lastError) value.error = lastError;
    return value;
  }

  function notify() {
    var value = state();
    listeners.forEach(function (listener) {
      try { listener(Object.assign({}, value)); }
      catch (error) { console.warn('AURA listening callback:', error); }
    });
  }

  function reportError(error) {
    lastError = error && error.message ? error.message : String(error);
    notify();
  }

  function hz(note) { return 440 * Math.pow(2, (note - 69) / 12); }

  function buildScore(name) {
    var events = [];
    function add(time, sound, notes, duration, level, pan) {
      events.push({ time: time, sound: sound, notes: notes, duration: duration, level: level, pan: pan || 0 });
    }
    if (name === 'studio') {
      // Fmaj7 / Am7 / Cmaj9 / Gsus: warm, unhurried studio chords.
      [[53, 57, 60, 64], [52, 55, 57, 60], [48, 55, 59, 62], [50, 55, 60, 62]].forEach(function (chord, index) {
        add(index * 4, 'pad', chord, 4.7, 0.15, index % 2 ? 0.1 : -0.1);
        add(index * 4, 'bass', [chord[0] - 12], 3.4, 0.12);
      });
      [72, 76, 74, 71, 72, 67, 69, 74].forEach(function (note, index) {
        add(1 + index * 2, 'bell', [note], 2.2, 0.064, index % 2 ? 0.18 : -0.18);
      });
    } else if (name === 'outdoor') {
      // A brighter pentatonic phrase with a light, rounded pluck.
      var phrase = [72, 76, 79, 76, 74, 76, 81, 79, 76, 72, 74, 79, 76, 74, 72, 67];
      phrase.forEach(function (note, index) {
        add(index, 'pluck', [note], 1.35, index % 4 === 0 ? 0.135 : 0.1, index % 2 ? 0.2 : -0.2);
      });
      [[48, 55, 60], [53, 57, 60], [57, 60, 64], [55, 59, 62]].forEach(function (chord, index) {
        add(index * 4, 'pad', chord, 4.1, 0.065);
        add(index * 4, 'bass', [chord[0] - 12], 1.8, 0.12);
        add(index * 4 + 2, 'bass', [chord[0]], 1.5, 0.073);
      });
    } else {
      // Sparse minor ninths, low sine bass, and widely spaced soft keys.
      [[45, 52, 55, 59], [41, 48, 52, 55]].forEach(function (chord, index) {
        add(index * 8, 'pad', chord, 9.1, 0.13, index ? 0.12 : -0.12);
        add(index * 8, 'bass', [chord[0] - 12], 7.5, 0.12);
      });
      [[1.5, 64], [4.5, 59], [7, 62], [10.5, 60], [13.5, 55]].forEach(function (note, index) {
        add(note[0], 'bell', [note[1]], 3.3, 0.069, index % 2 ? 0.25 : -0.25);
      });
    }
    return events.sort(function (a, b) { return a.time - b.time; });
  }

  function ensureContext() {
    if (context && context.state !== 'closed') return context;
    var AudioContextClass = window.AudioContext || window.webkitAudioContext;
    if (!AudioContextClass) throw new Error('当前浏览器不支持声音试听。');
    context = new AudioContextClass();
    master = context.createGain();
    master.gain.value = 0;
    compressor = context.createDynamicsCompressor();
    compressor.threshold.value = -19;
    compressor.knee.value = 18;
    compressor.ratio.value = 3;
    compressor.attack.value = 0.02;
    compressor.release.value = 0.25;
    master.connect(compressor);
    compressor.connect(context.destination);
    context.addEventListener('statechange', function () {
      if (playing && context && context.state === 'suspended') {
        // Browser / operating system interruptions leave the UI paused.
        stop();
      }
    });
    return context;
  }

  function createVoice(event, at) {
    var envelope = context.createGain();
    var filter = context.createBiquadFilter();
    var panner = context.createStereoPanner ? context.createStereoPanner() : null;
    var oscillators = [];
    var nodes = [envelope, filter];
    var end = at + event.duration;
    var attack = event.sound === 'pad' ? 0.7 : event.sound === 'bass' ? 0.06 : 0.025;
    var release = event.sound === 'pad' ? 1.2 : event.sound === 'bass' ? 0.65 : event.duration - attack;
    var peak = event.level / event.notes.length;
    var cleaned = false;
    var stopped = false;

    filter.type = 'lowpass';
    filter.frequency.value = event.sound === 'pad' ? 1150 : event.sound === 'pluck' ? 2800 : event.sound === 'bell' ? 2000 : 400;
    filter.Q.value = 0.35;
    envelope.connect(filter);
    if (panner) {
      panner.pan.value = event.pan;
      filter.connect(panner);
      panner.connect(master);
      nodes.push(panner);
    } else filter.connect(master);

    envelope.gain.setValueAtTime(0, at);
    envelope.gain.linearRampToValueAtTime(peak, at + attack);
    if (event.sound === 'pad' || event.sound === 'bass') {
      envelope.gain.setValueAtTime(peak * 0.8, Math.max(at + attack, end - release));
      envelope.gain.linearRampToValueAtTime(0, end);
    } else {
      envelope.gain.exponentialRampToValueAtTime(0.0001, end - 0.015);
      envelope.gain.linearRampToValueAtTime(0, end);
    }

    function addOscillator(note, harmonic, mix) {
      var oscillator = context.createOscillator();
      oscillator.type = event.sound === 'pad' ? 'triangle' : 'sine';
      oscillator.frequency.value = hz(note) * harmonic;
      if (event.sound === 'pad') oscillator.detune.value = oscillators.length % 2 ? 2.5 : -2.5;
      if (mix !== 1) {
        var harmonicGain = context.createGain();
        harmonicGain.gain.value = mix;
        oscillator.connect(harmonicGain);
        harmonicGain.connect(envelope);
        nodes.push(harmonicGain);
      } else oscillator.connect(envelope);
      oscillators.push(oscillator);
      oscillator.start(at);
      oscillator.stop(end + 0.025);
      return oscillator;
    }

    event.notes.forEach(function (note) {
      addOscillator(note, 1, 1);
      if (event.sound === 'bell' || event.sound === 'pluck') {
        addOscillator(note, 2, event.sound === 'pluck' ? 0.2 : 0.095);
      }
    });

    function cleanup() {
      if (cleaned) return;
      cleaned = true;
      oscillators.forEach(function (oscillator) { oscillator.disconnect(); });
      nodes.forEach(function (node) { node.disconnect(); });
      voices.delete(voice);
    }
    var remaining = oscillators.length;
    oscillators.forEach(function (oscillator) {
      oscillator.onended = function () {
        remaining -= 1;
        if (remaining === 0) cleanup();
      };
    });

    var voice = {
      stop: function () {
        if (stopped || cleaned) return;
        stopped = true;
        var now = context.currentTime;
        envelope.gain.cancelScheduledValues(now);
        envelope.gain.setTargetAtTime(0, now, 0.012);
        oscillators.forEach(function (oscillator) {
          try { oscillator.stop(now + 0.06); } catch (error) { /* Already finished. */ }
        });
      }
    };
    voices.add(voice);
  }

  function silenceVoices() {
    voices.forEach(function (voice) { voice.stop(); });
  }

  function schedule() {
    if (!playing || !context || context.state !== 'running') return;
    try {
      var now = context.currentTime;
      // Recover from a delayed timer without queuing a burst of stale notes.
      if (loopStart + LOOP_SECONDS < now) {
        loopStart += Math.floor((now - loopStart) / LOOP_SECONDS) * LOOP_SECONDS;
        eventIndex = 0;
      }
      while (loopStart + score[eventIndex].time < now + LOOK_AHEAD) {
        var event = score[eventIndex];
        var at = loopStart + event.time;
        if (at >= now - 0.015) createVoice(event, Math.max(at, now + 0.003));
        eventIndex += 1;
        if (eventIndex === score.length) {
          eventIndex = 0;
          loopStart += LOOP_SECONDS;
        }
      }
    } catch (error) {
      stop();
      reportError(error);
    }
  }

  function restartScore() {
    silenceVoices();
    score = buildScore(scene);
    eventIndex = 0;
    loopStart = context.currentTime + 0.075;
    schedule();
  }

  function setScene(value) {
    if (VALID_SCENES.indexOf(value) === -1) {
      reportError(new Error('无法识别这个试听场景。'));
      return state();
    }
    if (scene !== value) {
      scene = value;
      lastError = null;
      if (playing) restartScore();
      notify();
    }
    return state();
  }

  async function play(value) {
    if (value === undefined) value = 'studio';
    if (VALID_SCENES.indexOf(value) === -1) {
      reportError(new Error('无法识别这个试听场景。'));
      return state();
    }
    if (document.hidden) {
      lastError = '请回到当前页面，再开启声音试听。';
      notify();
      return state();
    }
    if (playing) {
      setScene(value);
      return state();
    }
    var request = ++generation;
    scene = value;
    lastError = null;
    if (suspendTimer) { clearTimeout(suspendTimer); suspendTimer = null; }
    try {
      var audioContext = ensureContext();
      await audioContext.resume();
      if (request !== generation) return state();
      if (audioContext.state !== 'running') throw new Error('声音尚未开启，请再次点击试听。');
      playing = true;
      master.gain.cancelScheduledValues(audioContext.currentTime);
      master.gain.setTargetAtTime(volume * 0.55, audioContext.currentTime, 0.035);
      restartScore();
      if (playing) {
        scheduler = window.setInterval(schedule, 80);
        notify();
      }
    } catch (error) {
      if (request !== generation) return state();
      stop();
      reportError(error);
    }
    return state();
  }

  function stop() {
    generation += 1;
    playing = false;
    if (scheduler) { clearInterval(scheduler); scheduler = null; }
    if (suspendTimer) { clearTimeout(suspendTimer); suspendTimer = null; }
    if (context && context.state !== 'closed') {
      silenceVoices();
      master.gain.cancelScheduledValues(context.currentTime);
      master.gain.setTargetAtTime(0, context.currentTime, 0.012);
      suspendTimer = window.setTimeout(function () {
        suspendTimer = null;
        if (!playing && context && context.state === 'running') {
          context.suspend().catch(function () { /* A closing page needs no message. */ });
        }
      }, 90);
    }
    notify();
    return state();
  }

  function setVolume(value) {
    var number = Number(value);
    if (!Number.isFinite(number)) return state();
    volume = Math.max(0, Math.min(1, number));
    if (context && master && playing) {
      master.gain.setTargetAtTime(volume * 0.55, context.currentTime, 0.025);
    }
    notify();
    return state();
  }

  function subscribe(callback) {
    if (typeof callback !== 'function') return function () {};
    listeners.add(callback);
    try { callback(state()); } catch (error) { console.warn('AURA listening callback:', error); }
    return function () { listeners.delete(callback); };
  }

  document.addEventListener('visibilitychange', function () {
    if (document.hidden) stop();
  });
  window.addEventListener('pagehide', function () {
    stop();
    if (suspendTimer) { clearTimeout(suspendTimer); suspendTimer = null; }
    if (context && context.state !== 'closed') {
      var closingContext = context;
      context = null;
      master = null;
      compressor = null;
      closingContext.close().catch(function () {});
      voices.clear();
    }
  });

  window.AuraAudio = {
    play: play,
    stop: stop,
    setScene: setScene,
    setVolume: setVolume,
    isPlaying: function () { return playing; },
    subscribe: subscribe
  };
}());
