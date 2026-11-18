// HUD: the DOM overlay (health, money, stars, ammo, objective, dialogue, timer)
// plus a circular 2D minimap drawn on a canvas. Styling lives in game/style.css.
import { TUNE } from './config.js';

export class HUD {
  constructor(world) {
    this.world = world;
    this.el = {
      health: document.getElementById('health-fill'),
      healthText: document.getElementById('health-text'),
      money: document.getElementById('money'),
      stars: document.getElementById('stars'),
      ammo: document.getElementById('ammo'),
      objective: document.getElementById('objective'),
      subtitle: document.getElementById('subtitle'),
      speaker: document.getElementById('speaker'),
      subtext: document.getElementById('subtext'),
      timer: document.getElementById('timer'),
      speed: document.getElementById('speed'),
      district: document.getElementById('district'),
      prompt: document.getElementById('prompt'),
      cash: document.getElementById('cash-flash'),
      minimap: document.getElementById('minimap'),
    };
    this.mapCtx = this.el.minimap.getContext('2d');
    this.marker = null;
    this.subtitleTimer = 0;
    this.cashTimer = 0;
    this.districtTimer = 0;
    this.lastDistrict = '';
  }

  setObjective(text) {
    this.el.objective.textContent = text;
  }

  setMarker(marker) {
    this.marker = marker;
  }

  setTimer(seconds) {
    if (seconds === null || seconds === undefined) {
      this.el.timer.style.display = 'none';
      return;
    }
    this.el.timer.style.display = 'block';
    this.el.timer.textContent = `⏱ ${Math.ceil(seconds)}s`;
    this.el.timer.classList.toggle('urgent', seconds < 15);
  }

  say(speaker, text, seconds = 4) {
    this.el.speaker.textContent = speaker;
    this.el.subtext.textContent = text;
    this.el.subtitle.style.display = 'block';
    this.subtitleTimer = seconds;
  }

  flashCash(amount) {
    this.el.cash.textContent = `+$${amount}`;
    this.el.cash.style.display = 'block';
    this.cashTimer = 1.6;
  }

  prompt(text) {
    if (text) {
      this.el.prompt.textContent = text;
      this.el.prompt.style.display = 'block';
    } else {
      this.el.prompt.style.display = 'none';
    }
  }

  districtOf(x, z) {
    if (z > TUNE.BEACH_Z) return 'Solbay Beach';
    if (x < -TUNE.HALF - 10) return 'Marina';
    const bx = Math.round(x / TUNE.SPACING + 3.5);
    const bz = Math.round(z / TUNE.SPACING + 3.5);
    if (bx >= 3 && bx <= 4 && bz >= 3 && bz <= 4) return 'Downtown Solbay';
    if (bx >= 6 && bz <= 1) return 'Solbay Airfield';
    if (bx >= 6 && bz >= 5) return 'Harbour';
    return 'Palm Court';
  }

  update(dt, game) {
    const p = game.player;
    this.el.health.style.width = `${Math.max(0, p.health)}%`;
    this.el.healthText.textContent = `${Math.ceil(p.health)}`;
    this.el.money.textContent = `$${Math.floor(p.money).toLocaleString('en-US')}`;
    const stars = game.police.stars;
    let starHtml = '';
    for (let i = 0; i < TUNE.MAX_STARS; i++) {
      starHtml += `<span class="${i < stars ? 'on' : ''}">★</span>`;
    }
    this.el.stars.innerHTML = starHtml;
    this.el.stars.classList.toggle('hot', stars >= 3);
    this.el.ammo.textContent = p.inCar ? '' : `🔫 ${p.ammo} / ${p.ammoReserve}`;
    const kmh = Math.round(Math.abs(p.inCar ? p.inCar.speed : p.speed) * 3.6);
    this.el.speed.textContent = p.inCar || p.speed > 0.5 ? `${kmh} km/h` : '';
    // District toast when crossing into a new neighbourhood.
    const d = this.districtOf(p.x, p.z);
    if (d !== this.lastDistrict) {
      this.lastDistrict = d;
      this.el.district.textContent = d;
      this.el.district.style.display = 'block';
      this.districtTimer = 2.5;
    }
    if (this.districtTimer > 0) {
      this.districtTimer -= dt;
      if (this.districtTimer <= 0) this.el.district.style.display = 'none';
    }
    if (this.subtitleTimer > 0) {
      this.subtitleTimer -= dt;
      if (this.subtitleTimer <= 0) this.el.subtitle.style.display = 'none';
    }
    if (this.cashTimer > 0) {
      this.cashTimer -= dt;
      if (this.cashTimer <= 0) this.el.cash.style.display = 'none';
    }
    this.drawMinimap(game);
  }

  drawMinimap(game) {
    const ctx = this.mapCtx;
    const S = 180; // canvas size
    const half = TUNE.HALF + 60;
    const toMap = (x, z) => [S / 2 + (x / half) * (S / 2), S / 2 + (z / half) * (S / 2)];
    ctx.clearRect(0, 0, S, S);
    ctx.save();
    ctx.beginPath();
    ctx.arc(S / 2, S / 2, S / 2 - 2, 0, Math.PI * 2);
    ctx.clip();
    // Land, sea, sand.
    ctx.fillStyle = '#5d7a48';
    ctx.fillRect(0, 0, S, S);
    const [, wy] = toMap(0, TUNE.SEA_Z);
    ctx.fillStyle = '#1e6f8e';
    ctx.fillRect(0, wy, S, S - wy);
    const [, by] = toMap(0, TUNE.BEACH_Z);
    ctx.fillStyle = '#e3c98f';
    ctx.fillRect(0, by, S, wy - by);
    // Roads.
    ctx.strokeStyle = '#3a3d43';
    ctx.lineWidth = 4;
    for (const line of this.world.roadLines) {
      const [x1] = toMap(line, 0);
      ctx.beginPath();
      ctx.moveTo(x1, 0);
      ctx.lineTo(x1, S);
      ctx.stroke();
      const [, z1] = toMap(0, line);
      ctx.beginPath();
      ctx.moveTo(0, z1);
      ctx.lineTo(S, z1);
      ctx.stroke();
    }
    // Runway.
    const [rx] = toMap(this.world.markers.airfield.x, 0);
    const [, rz] = toMap(0, this.world.markers.airfield.z);
    ctx.fillStyle = '#2e2e33';
    ctx.fillRect(rx - 3, rz - 14, 6, 28);
    // Pulsing objective marker.
    if (this.marker) {
      const [mx, mz] = toMap(this.marker.x, this.marker.z);
      const pulse = 6 + Math.sin(performance.now() * 0.006) * 2;
      ctx.fillStyle = '#ffd23e';
      ctx.beginPath();
      ctx.arc(mx, mz, pulse, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = '#fff';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.arc(mx, mz, pulse + 3, 0, Math.PI * 2);
      ctx.stroke();
    }
    // Traffic as pale dots, pursuit cars as blue dots.
    ctx.fillStyle = '#e8e8e8';
    for (const car of game.traffic.cars) {
      const [cx, cz] = toMap(car.x, car.z);
      ctx.fillRect(cx - 1.5, cz - 1.5, 3, 3);
    }
    ctx.fillStyle = '#2266ff';
    for (const cop of game.police.cops) {
      const [cx, cz] = toMap(cop.x, cop.z);
      ctx.beginPath();
      ctx.arc(cx, cz, 3, 0, Math.PI * 2);
      ctx.fill();
    }
    // Player arrow, rotated to the heading.
    const p = game.player;
    const [px, py] = toMap(p.x, p.z);
    ctx.save();
    ctx.translate(px, py);
    ctx.rotate(p.inCar ? p.inCar.heading : p.heading);
    ctx.fillStyle = '#fff';
    ctx.beginPath();
    ctx.moveTo(0, -6);
    ctx.lineTo(4, 5);
    ctx.lineTo(-4, 5);
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = '#000';
    ctx.lineWidth = 1;
    ctx.stroke();
    ctx.restore();
    ctx.restore();
    // Ring and north marker.
    ctx.strokeStyle = 'rgba(255,255,255,0.65)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(S / 2, S / 2, S / 2 - 2, 0, Math.PI * 2);
    ctx.stroke();
    ctx.fillStyle = '#fff';
    ctx.font = 'bold 11px sans-serif';
    ctx.fillText('N', S / 2 - 4, 13);
  }
}
