(() => {
  const INVINCIBLE_MS = 1500;
  const BEST_KEY = "aiCyberRunBestScore";
  const SETTINGS_KEY = "aiCyberRunSettings";
  const LANE_PERCENTS = [16.6, 50, 83.4];
  const SPRITE_H = 148;
  const PLAYER_BOTTOM = 12;
  const JUMP_LIFT = 92;

  const CHAR_STATS = {
    chick: { lives: 3, hitScale: 0.52 },
    bear: { lives: 6, hitScale: 1.18 },
  };

  const DEFAULT_SETTINGS = {
    bgm: 35,
    sfx: 55,
    keys: { left: "ArrowLeft", right: "ArrowRight", jump: " " },
  };

  const audio = {
    current: "lobby",
    lobby: new Audio("assets/audio/bgm-lobby.mp3"),
    game: new Audio("assets/audio/bgm-game.mp3"),
    sfx: {
      click: "assets/audio/sfx-click.wav",
      confirm: "assets/audio/sfx-confirm.wav",
      jump: "assets/audio/sfx-jump.wav",
      collect: "assets/audio/sfx-collect.wav",
      heal: "assets/audio/sfx-heal.ogg",
      obstacle: "assets/audio/sfx-obstacle.ogg",
      data: "assets/audio/sfx-data.ogg",
      hurt: "assets/audio/sfx-hurt.wav",
      over: "assets/audio/sfx-over.wav",
    },
  };

  audio.lobby.loop = true;
  audio.game.loop = true;
  audio.lobby.preload = "auto";
  audio.game.preload = "auto";

  const screens = {
    select: document.getElementById("screen-select"),
    play: document.getElementById("screen-play"),
    over: document.getElementById("screen-over"),
  };

  const els = {
    start: document.getElementById("btn-start"),
    retry: document.getElementById("btn-retry"),
    reselect: document.getElementById("btn-reselect"),
    score: document.getElementById("hud-score"),
    lives: document.getElementById("hud-lives"),
    world: document.getElementById("world"),
    entities: document.getElementById("entities"),
    floats: document.getElementById("float-texts"),
    player: document.getElementById("player"),
    sprite: document.getElementById("player-sprite"),
    overScore: document.getElementById("over-score"),
    overBest: document.getElementById("over-best"),
    cards: document.querySelectorAll(".char-card"),
    preview: document.getElementById("preview-hearts"),
    overlay: document.getElementById("settings-overlay"),
    bgm: document.getElementById("set-bgm"),
    sfx: document.getElementById("set-sfx"),
    bgmVal: document.getElementById("set-bgm-val"),
    sfxVal: document.getElementById("set-sfx-val"),
    bindHint: document.getElementById("bind-hint"),
    closeSettings: document.getElementById("btn-settings-close"),
    openSettingsPlay: document.getElementById("btn-settings-play"),
    tabCharacter: document.getElementById("tab-character"),
    tabSettings: document.getElementById("tab-settings"),
    keyLeft: document.getElementById("key-left"),
    keyRight: document.getElementById("key-right"),
    keyJump: document.getElementById("key-jump"),
  };

  const RUN_FRAMES = 5;
  const RUN_FRAME_MS = 90;

  const game = {
    character: null,
    maxLives: 3,
    playing: false,
    paused: false,
    lives: 3,
    score: 0,
    lane: 1,
    jumping: false,
    jumpUntil: 0,
    invincibleUntil: 0,
    runTime: 0,
    survivalAcc: 0,
    spawnAcc: 0,
    entities: [],
    nextId: 1,
    lastTs: 0,
    raf: 0,
    pose: "run",
    poseUntil: 0,
    runFrame: 1,
    runAcc: 0,
  };

  const ui = {
    listening: null,
    settingsFrom: "select",
  };

  function loadSettings() {
    try {
      const raw = JSON.parse(localStorage.getItem(SETTINGS_KEY) || "null");
      if (!raw || typeof raw !== "object") return { ...DEFAULT_SETTINGS, keys: { ...DEFAULT_SETTINGS.keys } };
      const bgm = clampVol(raw.bgm);
      const sfx = clampVol(raw.sfx);
      const resetVol = !raw.v && bgm === 0 && sfx === 0;
      return {
        bgm: resetVol ? DEFAULT_SETTINGS.bgm : bgm,
        sfx: resetVol ? DEFAULT_SETTINGS.sfx : sfx,
        keys: {
          left: typeof raw.keys?.left === "string" ? raw.keys.left : DEFAULT_SETTINGS.keys.left,
          right: typeof raw.keys?.right === "string" ? raw.keys.right : DEFAULT_SETTINGS.keys.right,
          jump: typeof raw.keys?.jump === "string" ? raw.keys.jump : DEFAULT_SETTINGS.keys.jump,
        },
      };
    } catch {
      return { ...DEFAULT_SETTINGS, keys: { ...DEFAULT_SETTINGS.keys } };
    }
  }

  function clampVol(n) {
    const v = Number(n);
    if (!Number.isFinite(v)) return 35;
    return Math.max(0, Math.min(100, Math.round(v)));
  }

  const settings = loadSettings();

  function saveSettings() {
    localStorage.setItem(SETTINGS_KEY, JSON.stringify({ ...settings, v: 1 }));
  }

  function formatKey(key) {
    const map = {
      " ": "Space",
      ArrowLeft: "←",
      ArrowRight: "→",
      ArrowUp: "↑",
      ArrowDown: "↓",
      Escape: "Esc",
    };
    if (map[key]) return map[key];
    if (key.length === 1) return key.toUpperCase();
    return key;
  }

  function applyVolumes() {
    const bgm = settings.bgm / 100;
    audio.lobby.volume = bgm * 0.9;
    audio.game.volume = bgm;
    if (settings.bgm <= 0) {
      audio.lobby.pause();
      audio.game.pause();
    } else if (!game.paused || audio.current === "lobby") {
      playBgm(audio.current);
    }
  }

  function spriteFile() {
    if (game.pose === "run") return `run${game.runFrame}.png`;
    return `${game.pose}.png`;
  }

  function applySprite() {
    if (!game.character) return;
    els.sprite.src = `assets/${game.character}/${spriteFile()}`;
    els.player.classList.toggle("happy", game.pose === "happy");
  }

  function setPose(pose, durationMs = 0) {
    game.pose = pose;
    game.poseUntil = durationMs ? performance.now() + durationMs : 0;
    if (pose === "run") game.runFrame = 1;
    applySprite();
  }

  function padScore(n) {
    return String(Math.floor(n)).padStart(5, "0");
  }

  function getBest() {
    return Number(localStorage.getItem(BEST_KEY) || 0);
  }

  function saveBest(score) {
    const best = Math.max(getBest(), Math.floor(score));
    localStorage.setItem(BEST_KEY, String(best));
    return best;
  }

  function playSfx(name) {
    if (settings.sfx <= 0) return;
    const src = audio.sfx[name];
    if (!src) return;
    const clip = new Audio(src);
    const boost = name === "hurt" || name === "over" ? 0.82 : 1;
    clip.volume = Math.min(1, (settings.sfx / 100) * boost);
    clip.play().catch(() => {});
  }

  function playBgm(which, restart = false) {
    audio.current = which;
    const next = which === "game" ? audio.game : audio.lobby;
    const other = which === "game" ? audio.lobby : audio.game;
    other.pause();
    if (settings.bgm <= 0) return;
    if (restart) next.currentTime = 0;
    next.play().catch(() => {});
  }

  function showScreen(name) {
    Object.entries(screens).forEach(([key, el]) => {
      el.classList.toggle("hidden", key !== name);
    });
    if (name === "play") playBgm("game", true);
    else playBgm("lobby");
  }

  function statsFor(name) {
    return CHAR_STATS[name] || CHAR_STATS.chick;
  }

  function setCharacter(name) {
    game.character = name;
    game.maxLives = statsFor(name).lives;
    els.cards.forEach((card) => {
      card.classList.toggle("selected", card.dataset.character === name);
    });
    els.start.disabled = false;
    els.preview.textContent = "❤️".repeat(game.maxLives);
    els.preview.setAttribute("aria-label", `목숨 ${game.maxLives}개`);
    ["front", "happy", "hurt", "run1", "run2", "run3", "run4", "run5"].forEach((file) => {
      const img = new Image();
      img.src = `assets/${name}/${file}.png`;
    });
  }

  function difficulty(t) {
    if (t < 30) return { speed: 260, interval: 1.45, dualChance: 0, burst: false };
    if (t < 60) return { speed: 360, interval: 1.1, dualChance: 0.15, burst: false };
    if (t < 90) return { speed: 460, interval: 0.88, dualChance: 0.55, burst: false };
    return { speed: 580, interval: 0.62, dualChance: 0.7, burst: true };
  }

  function laneX(lane, width) {
    return (width * LANE_PERCENTS[lane]) / 100;
  }

  function applyLane() {
    els.player.style.left = `${LANE_PERCENTS[game.lane]}%`;
  }

  function updateHud() {
    els.score.textContent = padScore(game.score);
    els.lives.textContent = `❤️ × ${game.lives}`;
  }

  function floatText(text, x, y) {
    const node = document.createElement("div");
    node.className = "float-text";
    node.textContent = text;
    node.style.left = `${x}px`;
    node.style.top = `${y}px`;
    els.floats.appendChild(node);
    setTimeout(() => node.remove(), 800);
  }

  function spawnOne(type, lane, y = -40) {
    const node = document.createElement("div");
    node.className = `entity ${type}`;
    node.textContent = type === "virus" ? "🦠" : type === "vaccine" ? "💉" : "⭐";
    els.entities.appendChild(node);
    game.entities.push({
      id: game.nextId++,
      type,
      lane,
      y,
      el: node,
    });
  }

  function pickType() {
    const roll = Math.random();
    if (roll < 0.68) return "virus";
    if (roll < 0.9) return "vaccine";
    return "chip";
  }

  function spawnWave(diff) {
    const lanes = [0, 1, 2];
    const dual = Math.random() < diff.dualChance;
    const count = dual ? 2 : 1;
    const chosen = [];
    while (chosen.length < count) {
      const lane = lanes[Math.floor(Math.random() * lanes.length)];
      if (!chosen.includes(lane)) chosen.push(lane);
    }

    chosen.forEach((lane, i) => {
      const type = i === 0 ? pickType() : "virus";
      const extraY = diff.burst && i === 1 ? -90 : -40;
      spawnOne(type, lane, extraY);
    });

    if (diff.burst && Math.random() < 0.35) {
      const free = lanes.find((lane) => !chosen.includes(lane));
      if (free !== undefined && Math.random() < 0.4) {
        spawnOne(pickType() === "virus" ? "vaccine" : pickType(), free, -160);
      }
    }
  }

  function resetRun() {
    cancelAnimationFrame(game.raf);
    const stats = statsFor(game.character);
    game.playing = true;
    game.paused = false;
    game.maxLives = stats.lives;
    game.lives = stats.lives;
    game.score = 0;
    game.lane = 1;
    game.jumping = false;
    game.jumpUntil = 0;
    game.invincibleUntil = 0;
    game.runTime = 0;
    game.survivalAcc = 0;
    game.spawnAcc = 0.4;
    game.entities = [];
    game.nextId = 1;
    game.lastTs = 0;
    els.entities.innerHTML = "";
    els.floats.innerHTML = "";
    els.player.classList.remove("jumping", "invincible", "happy");
    game.pose = "run";
    game.poseUntil = 0;
    game.runFrame = 1;
    game.runAcc = 0;
    applySprite();
    applyLane();
    updateHud();
    closeSettings();
    showScreen("play");
    game.raf = requestAnimationFrame(loop);
  }

  function gameOver() {
    game.playing = false;
    game.paused = false;
    cancelAnimationFrame(game.raf);
    playSfx("over");
    const best = saveBest(game.score);
    els.overScore.textContent = Math.floor(game.score).toLocaleString("ko-KR");
    els.overBest.textContent = best.toLocaleString("ko-KR");
    showScreen("over");
  }

  function hitVirus(now, entity) {
    if (now < game.invincibleUntil) return;
    game.lives -= 1;
    game.invincibleUntil = now + INVINCIBLE_MS;
    els.player.classList.add("invincible");
    setPose("hurt", 650);
    updateHud();
    playSfx("obstacle");
    floatText("감염 -1", entity.el.getBoundingClientRect().left, 360);
    if (game.lives <= 0) gameOver();
  }

  function takeItem(entity) {
    const worldBox = els.world.getBoundingClientRect();
    const box = entity.el.getBoundingClientRect();
    const x = box.left - worldBox.left + 26;
    const y = box.top - worldBox.top;

    if (entity.type === "vaccine") {
      setPose("happy", 700);
      playSfx("heal");
      if (game.lives < game.maxLives) {
        game.lives += 1;
        game.score += 100;
        floatText("HEAL +❤️  +100", x, y);
      } else {
        game.score += 500;
        floatText("HEAL MAX +500", x, y);
      }
    } else {
      playSfx("data");
      game.score += 200;
      floatText("DATA +200", x, y);
    }
    updateHud();
  }

  function overlapsPlayer(entity, worldH) {
    const scale = statsFor(game.character).hitScale;
    const playerY = worldH - PLAYER_BOTTOM - SPRITE_H;
    const playerTop = game.jumping ? playerY - JUMP_LIFT : playerY;
    const hitH = SPRITE_H * scale;
    const pad = (SPRITE_H - hitH) / 2;
    const hitTop = playerTop + pad;
    const hitBottom = hitTop + hitH;
    const itemTop = entity.y;
    const itemBottom = entity.y + 52;
    const sameLane = entity.lane === game.lane;
    const vertical = itemBottom > hitTop + 8 && itemTop < hitBottom - 8;
    return sameLane && vertical;
  }

  function loop(ts) {
    if (!game.playing) return;
    if (game.paused) {
      game.lastTs = 0;
      game.raf = requestAnimationFrame(loop);
      return;
    }
    if (!game.lastTs) game.lastTs = ts;
    const dt = Math.min(0.04, (ts - game.lastTs) / 1000);
    game.lastTs = ts;
    const now = performance.now();

    game.runTime += dt;
    game.survivalAcc += dt;
    if (game.survivalAcc >= 1) {
      const ticks = Math.floor(game.survivalAcc);
      game.score += 10 * ticks;
      game.survivalAcc -= ticks;
      updateHud();
    }

    if (game.jumping && now >= game.jumpUntil) {
      game.jumping = false;
      els.player.classList.remove("jumping");
    }

    if (game.pose !== "run" && now >= game.poseUntil) {
      setPose("run");
    }

    if (game.pose === "run") {
      game.runAcc += dt * 1000;
      if (game.runAcc >= RUN_FRAME_MS) {
        game.runAcc = 0;
        game.runFrame = (game.runFrame % RUN_FRAMES) + 1;
        applySprite();
      }
    }

    if (now >= game.invincibleUntil) {
      els.player.classList.remove("invincible");
    }

    const diff = difficulty(game.runTime);
    game.spawnAcc += dt;
    if (game.spawnAcc >= diff.interval) {
      game.spawnAcc = 0;
      spawnWave(diff);
    }

    const height = els.world.clientHeight;
    const width = els.world.clientWidth;

    game.entities = game.entities.filter((entity) => {
      entity.y += diff.speed * dt;
      entity.el.style.top = `${entity.y}px`;
      entity.el.style.left = `${laneX(entity.lane, width)}px`;

      if (overlapsPlayer(entity, height)) {
        if (entity.type === "virus") {
          if (!game.jumping) hitVirus(now, entity);
          else return true;
        } else {
          takeItem(entity);
        }
        entity.el.remove();
        return false;
      }

      if (entity.y > height + 60) {
        entity.el.remove();
        return false;
      }
      return true;
    });

    game.raf = requestAnimationFrame(loop);
  }

  function jump() {
    if (!game.playing || game.paused || game.jumping) return;
    game.jumping = true;
    game.jumpUntil = performance.now() + 420;
    els.player.classList.add("jumping");
    playSfx("jump");
  }

  function move(dir) {
    if (!game.playing || game.paused) return;
    game.lane = Math.max(0, Math.min(2, game.lane + dir));
    applyLane();
  }

  function syncSettingsUi() {
    els.bgm.value = String(settings.bgm);
    els.sfx.value = String(settings.sfx);
    els.bgmVal.textContent = `${settings.bgm}%`;
    els.sfxVal.textContent = `${settings.sfx}%`;
    els.keyLeft.textContent = formatKey(settings.keys.left);
    els.keyRight.textContent = formatKey(settings.keys.right);
    els.keyJump.textContent = formatKey(settings.keys.jump);
    document.querySelectorAll(".keybind").forEach((btn) => {
      btn.classList.toggle("listening", ui.listening === btn.dataset.action);
    });
    els.bindHint.textContent = ui.listening
      ? "원하는 키를 누르세요. Esc는 취소입니다."
      : "키 버튼을 누른 뒤 원하는 키를 입력하세요.";
  }

  function setMainTab(name) {
    const isSettings = name === "settings";
    els.tabCharacter.classList.toggle("active", !isSettings);
    els.tabSettings.classList.toggle("active", isSettings);
    els.tabCharacter.setAttribute("aria-selected", String(!isSettings));
    els.tabSettings.setAttribute("aria-selected", String(isSettings));
  }

  function openSettings(from) {
    ui.settingsFrom = from;
    ui.listening = null;
    if (from === "play" && game.playing) game.paused = true;
    if (from === "select") setMainTab("settings");
    syncSettingsUi();
    els.overlay.classList.remove("hidden");
  }

  function closeSettings() {
    ui.listening = null;
    els.overlay.classList.add("hidden");
    setMainTab("character");
    if (ui.settingsFrom === "play" && game.playing) game.paused = false;
  }

  function bindKey(action, key) {
    const used = Object.entries(settings.keys).find(([name, value]) => name !== action && value === key);
    if (used) {
      els.bindHint.textContent = `이미 ${used[0] === "left" ? "왼쪽" : used[0] === "right" ? "오른쪽" : "점프"}에 쓰인 키입니다.`;
      return false;
    }
    settings.keys[action] = key;
    saveSettings();
    ui.listening = null;
    syncSettingsUi();
    playSfx("click");
    return true;
  }

  els.cards.forEach((card) => {
    card.addEventListener("click", () => {
      playSfx("click");
      setCharacter(card.dataset.character);
      playBgm("lobby");
    });
  });

  els.start.addEventListener("click", () => {
    if (!game.character) return;
    playSfx("confirm");
    resetRun();
  });

  els.retry.addEventListener("click", () => {
    if (!game.character) return;
    playSfx("confirm");
    resetRun();
  });

  els.reselect.addEventListener("click", () => {
    game.playing = false;
    game.paused = false;
    cancelAnimationFrame(game.raf);
    playSfx("click");
    closeSettings();
    showScreen("select");
  });

  els.tabCharacter.addEventListener("click", () => {
    playSfx("click");
    closeSettings();
  });

  els.tabSettings.addEventListener("click", () => {
    playSfx("click");
    openSettings("select");
  });

  els.openSettingsPlay.addEventListener("click", () => {
    playSfx("click");
    openSettings("play");
  });

  els.closeSettings.addEventListener("click", () => {
    playSfx("click");
    closeSettings();
  });

  els.overlay.addEventListener("click", (event) => {
    if (event.target === els.overlay) closeSettings();
  });

  els.bgm.addEventListener("input", () => {
    if (els.overlay.classList.contains("hidden")) return;
    settings.bgm = clampVol(els.bgm.value);
    saveSettings();
    applyVolumes();
    syncSettingsUi();
  });

  els.sfx.addEventListener("input", () => {
    if (els.overlay.classList.contains("hidden")) return;
    settings.sfx = clampVol(els.sfx.value);
    saveSettings();
    syncSettingsUi();
  });

  document.querySelectorAll(".keybind").forEach((btn) => {
    btn.addEventListener("click", () => {
      ui.listening = btn.dataset.action;
      syncSettingsUi();
    });
  });

  applyVolumes();
  saveSettings();
  syncSettingsUi();
  window.addEventListener("pointerdown", () => playBgm(audio.current), { once: true });

  window.addEventListener("keydown", (event) => {
    if (ui.listening) {
      event.preventDefault();
      if (event.key === "Escape") {
        ui.listening = null;
        syncSettingsUi();
        return;
      }
      if (event.key === "Tab") return;
      bindKey(ui.listening, event.key);
      return;
    }

    if (!els.overlay.classList.contains("hidden")) {
      if (event.key === "Escape") {
        event.preventDefault();
        closeSettings();
      }
      return;
    }

    const { left, right, jump } = settings.keys;
    if (event.key === left || event.key === right || event.key === jump) event.preventDefault();
    if (event.key === left) move(-1);
    if (event.key === right) move(1);
    if (event.key === jump) jump();
  });
})();
