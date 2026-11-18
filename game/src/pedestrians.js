// Pedestrians: sidewalk walkers who stroll, flee gunfire and go down when shot.
// Built from boxes; the walk is a bob and a torso sway.
import * as THREE from 'three';
import { makeRng, pickFrom, between, distSq } from './random.js';

const SHIRTS = [0xd85a4a, 0x4a7ad8, 0x4ad87a, 0xd8c84a, 0x8a4ad8, 0xe8e8e8, 0x3a3a3a, 0xd88a4a];
const PANTS = [0x2a3a4a, 0x4a3a2a, 0x5a5a5a, 0x1a2a3a];
const SKINS = [0xe8b88a, 0xc89878, 0x8a5a3a, 0xf0c8a0];

export function buildPedMesh(shirt, pants) {
  const g = new THREE.Group();
  const skin = new THREE.MeshLambertMaterial({
    color: SKINS[Math.floor(Math.random() * SKINS.length)],
  });
  const legs = new THREE.Mesh(
    new THREE.BoxGeometry(0.42, 0.75, 0.26),
    new THREE.MeshLambertMaterial({ color: pants }),
  );
  legs.position.y = 0.375;
  const torso = new THREE.Mesh(
    new THREE.BoxGeometry(0.55, 0.62, 0.3),
    new THREE.MeshLambertMaterial({ color: shirt }),
  );
  torso.position.y = 1.06;
  const head = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.36, 0.32), skin);
  head.position.y = 1.56;
  const hair = new THREE.Mesh(
    new THREE.BoxGeometry(0.36, 0.14, 0.34),
    new THREE.MeshLambertMaterial({ color: 0x2a1a0a }),
  );
  hair.position.y = 1.78;
  g.add(legs, torso, head, hair);
  g.userData = { torso, legs, head };
  return g;
}

export class Pedestrians {
  constructor(scene, world, seed = 11) {
    this.scene = scene;
    this.world = world;
    this.rng = makeRng(seed);
    this.peds = [];
    this.spawnTimer = 0;
  }

  spawn(x, z, opts = {}) {
    const shirt = opts.shirt ?? pickFrom(this.rng, SHIRTS);
    const pants = opts.pants ?? pickFrom(this.rng, PANTS);
    const mesh = buildPedMesh(shirt, pants);
    mesh.position.set(x, 0, z);
    this.scene.add(mesh);
    const ped = {
      mesh,
      x,
      z,
      heading: this.rng() * Math.PI * 2,
      speed: between(this.rng, 1.2, 2.4),
      state: opts.state ?? 'stroll',
      health: 100,
      down: false,
      downTimer: 0,
      fleeTarget: null,
      fleeTimer: 0,
      isThug: !!opts.isThug,
      isPassenger: !!opts.isPassenger,
      walkPhase: this.rng() * Math.PI * 2,
      retarget: 0,
    };
    if (ped.isThug) {
      // Thugs carry a pistol — a dark box in the hand.
      const gun = new THREE.Mesh(
        new THREE.BoxGeometry(0.08, 0.08, 0.4),
        new THREE.MeshLambertMaterial({ color: 0x111111 }),
      );
      gun.position.set(0.32, 1.05, 0.25);
      mesh.add(gun);
    }
    this.peds.push(ped);
    return ped;
  }

  populate(count = 22) {
    const rng = this.rng;
    const lines = this.world.roadLines;
    for (let i = 0; i < count; i++) {
      const along = pickFrom(rng, lines);
      const cross = between(rng, -220, 220);
      const onXStreet = rng() < 0.5;
      const x = onXStreet ? along + (rng() < 0.5 ? 7.5 : -7.5) : cross;
      const z = onXStreet ? cross : along + (rng() < 0.5 ? 7.5 : -7.5);
      this.spawn(x, z);
    }
  }

  nearest(x, z, maxD, filter) {
    let best = null;
    let bd = maxD * maxD;
    for (const p of this.peds) {
      if (p.down || (filter && !filter(p))) continue;
      const d = distSq(x, z, p.x, p.z);
      if (d < bd) {
        bd = d;
        best = p;
      }
    }
    return best;
  }

  fleeAll(fromX, fromZ, radius = 40) {
    for (const p of this.peds) {
      if (p.down) continue;
      if (distSq(p.x, p.z, fromX, fromZ) < radius * radius) {
        p.state = 'flee';
        p.fleeTarget = { x: p.x + (p.x - fromX), z: p.z + (p.z - fromZ) };
        p.fleeTimer = 4;
      }
    }
  }

  update(dt, playerPos, gunfirePos) {
    if (gunfirePos) this.fleeAll(gunfirePos.x, gunfirePos.z, 45);
    this.spawnTimer -= dt;
    if (this.spawnTimer <= 0 && playerPos) {
      this.spawnTimer = 5;
      const alive = this.peds.filter((p) => !p.down).length;
      if (alive < 20) {
        const lines = this.world.roadLines;
        const along = pickFrom(this.rng, lines);
        const near = 50 + this.rng() * 50;
        const dir = this.rng() < 0.5 ? 1 : -1;
        const onX = this.rng() < 0.5;
        this.spawn(
          onX ? along + (this.rng() < 0.5 ? 7.5 : -7.5) : playerPos.x + dir * near,
          onX ? playerPos.z + dir * near : along + (this.rng() < 0.5 ? 7.5 : -7.5),
        );
      }
    }
    for (const p of this.peds) {
      if (p.down) {
        p.downTimer -= dt;
        if (p.downTimer <= 0) {
          // The ambulance took them away.
          p.mesh.visible = false;
          p.gone = true;
        }
        continue;
      }
      p.retarget -= dt;
      if (p.state === 'flee') {
        p.fleeTimer -= dt;
        if (p.fleeTimer <= 0) p.state = 'stroll';
        const dx = p.fleeTarget.x - p.x;
        const dz = p.fleeTarget.z - p.z;
        const d = Math.hypot(dx, dz) || 1;
        p.heading = Math.atan2(dx, dz);
        p.speed = 5.5;
        p.x += (dx / d) * p.speed * dt;
        p.z += (dz / d) * p.speed * dt;
      } else {
        // Stroll the nearest sidewalk, picking a new direction at intersections.
        if (p.retarget <= 0) {
          p.retarget = between(this.rng, 4, 9);
          const road = this.world.nearestRoad(p.x, p.z);
          if (road.axis === 'z') {
            p.heading = (this.rng() < 0.5 ? Math.PI / 2 : -Math.PI / 2) + between(this.rng, -0.3, 0.3);
            p.z = road.coord + (this.rng() < 0.5 ? 7.5 : -7.5);
          } else {
            p.heading = (this.rng() < 0.5 ? 0 : Math.PI) + between(this.rng, -0.3, 0.3);
            p.x = road.coord + (this.rng() < 0.5 ? 7.5 : -7.5);
          }
          p.speed = between(this.rng, 1.2, 2.4);
        }
        p.x += Math.sin(p.heading) * p.speed * dt;
        p.z += Math.cos(p.heading) * p.speed * dt;
        const fixed = this.world.collideCircle(p.x, p.z, 0.5);
        p.x = fixed.x;
        p.z = fixed.z;
      }
      // Walk bob.
      p.walkPhase += dt * (p.state === 'flee' ? 12 : 7);
      p.mesh.position.set(p.x, Math.abs(Math.sin(p.walkPhase)) * 0.06, p.z);
      p.mesh.rotation.y = p.heading;
      p.mesh.userData.torso.position.y = 1.06 + Math.abs(Math.sin(p.walkPhase)) * 0.04;
    }
    this.peds = this.peds.filter((p) => !p.gone);
  }

  // Hurt a ped. Returns true when they went down.
  damage(ped, amount, headshot) {
    if (ped.down) return false;
    ped.health -= amount;
    if (ped.health <= 0 || headshot) {
      ped.down = true;
      ped.downTimer = 8;
      ped.mesh.rotation.x = -Math.PI / 2;
      ped.mesh.position.y = 0.3;
      return true;
    }
    // Staggered: run away.
    ped.state = 'flee';
    ped.fleeTarget = {
      x: ped.x + between(this.rng, -20, 20),
      z: ped.z + between(this.rng, -20, 20),
    };
    ped.fleeTimer = 3;
    return false;
  }
}
