(() => {
  const MAX_LIVES = 5;
  const INVINCIBLE_MS = 1500;
  const BEST_KEY = "aiCyberRunBestScore";
  const MUTE_KEY = "aiCyberRunMuted";
  const LANE_PERCENTS = [16.6, 50, 83.4];

  const audio = {
    muted: localStorage.getItem(MUTE_KEY) === "1",
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
  audio.lobby.volume = 0.32;
  audio.game.volume = 0.38;
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
    mute: document.getElementById("btn-mute"),
  };

  const RUN_FRAMES = 5;
  const RUN_FRAME_MS = 90;

  const game = {
    character: null,
    playing: false,
    lives: MAX_LIVES,
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
    if (audio.muted) return;
    const src = audio.sfx[name];
    if (!src) return;
    const clip = new Audio(src);
    clip.volume = name === "hurt" || name === "over" ? 0.45 : 0.55;
    clip.play().catch(() => {});
  }

  function playBgm(which, restart = false) {
    audio.current = which;
    const next = which === "game" ? audio.game : audio.lobby;
    const other = which === "game" ? audio.lobby : audio.game;
    other.pause();
    if (audio.muted) return;
    if (restart) next.currentTime = 0;
    next.play().catch(() => {});
  }

  function updateMuteButton() {
    els.mute.textContent = audio.muted ? "🔇" : "🔊";
    els.mute.setAttribute("aria-label", audio.muted ? "소리 켜기" : "소리 끄기");
  }

  function setMuted(muted) {
    audio.muted = muted;
    localStorage.setItem(MUTE_KEY, muted ? "1" : "0");
    if (muted) {
      audio.lobby.pause();
      audio.game.pause();
    } else {
      playBgm(audio.current);
    }
    updateMuteButton();
  }

  function showScreen(name) {
    Object.entries(screens).forEach(([key, el]) => {
      el.classList.toggle("hidden", key !== name);
    });
    if (name === "play") playBgm("game", true);
    else playBgm("lobby");
  }

  function setCharacter(name) {
    game.character = name;
    els.cards.forEach((card) => {
      card.classList.toggle("selected", card.dataset.character === name);
    });
    els.start.disabled = false;
    ["front", "happy", "hurt", "run1", "run2", "run3", "run4", "run5"].forEach((file) => {
      const img = new Image();
      img.src = `assets/${name}/${file}.png`;
    });
  }

  function heartsText(n) {
    return "❤️".repeat(n) + "🖤".repeat(MAX_LIVES - n);
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
    game.playing = true;
    game.lives = MAX_LIVES;
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
    showScreen("play");
    game.raf = requestAnimationFrame(loop);
  }

  function gameOver() {
    game.playing = false;
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
      if (game.lives < MAX_LIVES) {
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
    const playerY = worldH - 12 - 148;
    const playerTop = game.jumping ? playerY - 92 : playerY;
    const playerBottom = playerTop + 148;
    const itemTop = entity.y;
    const itemBottom = entity.y + 52;
    const sameLane = entity.lane === game.lane;
    const vertical = itemBottom > playerTop + 12 && itemTop < playerBottom - 8;
    return sameLane && vertical;
  }

  function loop(ts) {
    if (!game.playing) return;
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
    if (!game.playing || game.jumping) return;
    game.jumping = true;
    game.jumpUntil = performance.now() + 420;
    els.player.classList.add("jumping");
    playSfx("jump");
  }

  function move(dir) {
    if (!game.playing) return;
    game.lane = Math.max(0, Math.min(2, game.lane + dir));
    applyLane();
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
    cancelAnimationFrame(game.raf);
    playSfx("click");
    showScreen("select");
  });

  els.mute.addEventListener("click", () => {
    setMuted(!audio.muted);
  });

  updateMuteButton();
  window.addEventListener("pointerdown", () => playBgm(audio.current), { once: true });

  window.addEventListener("keydown", (event) => {
    const keys = ["ArrowLeft", "ArrowRight", "ArrowUp", " "];
    if (keys.includes(event.key)) event.preventDefault();
    if (event.key === "ArrowLeft") move(-1);
    if (event.key === "ArrowRight") move(1);
    if (event.key === "ArrowUp" || event.key === " ") jump();
  });
})();
