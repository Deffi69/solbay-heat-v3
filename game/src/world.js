// The city of Solbay: a 9-by-9 street grid, towers downtown, beach and a pier to the
// south, a marina on the west edge, harbour warehouses east, an airfield north-east.
// All geometry is procedural — boxes, cylinders and canvas textures, no loaded assets.
// Collision is axis-aligned boxes on the ground plane.
import * as THREE from 'three';
import { TUNE } from './config.js';
import { makeRng, pickFrom, between } from './random.js';

// Canvas texture helpers — each paints a small tile and returns a three.js texture.
function litWindows(base, litChance) {
  const c = document.createElement('canvas');
  c.width = 64;
  c.height = 128;
  const g = c.getContext('2d');
  g.fillStyle = base;
  g.fillRect(0, 0, 64, 128);
  for (let y = 8; y < 120; y += 16) {
    for (let x = 6; x < 58; x += 14) {
      g.fillStyle = Math.random() < litChance ? '#ffd98a' : '#1d2733';
      g.fillRect(x, y, 9, 10);
    }
  }
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

function asphalt() {
  const c = document.createElement('canvas');
  c.width = 128;
  c.height = 128;
  const g = c.getContext('2d');
  g.fillStyle = '#33363b';
  g.fillRect(0, 0, 128, 128);
  for (let i = 0; i < 400; i++) {
    g.fillStyle = Math.random() < 0.5 ? '#2b2e33' : '#3a3d43';
    g.fillRect(Math.random() * 128, Math.random() * 128, 2, 2);
  }
  const tex = new THREE.CanvasTexture(c);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

function sand() {
  const c = document.createElement('canvas');
  c.width = 128;
  c.height = 128;
  const g = c.getContext('2d');
  g.fillStyle = '#e3c98f';
  g.fillRect(0, 0, 128, 128);
  for (let i = 0; i < 500; i++) {
    g.fillStyle = Math.random() < 0.5 ? '#d9bd7f' : '#ecd5a1';
    g.fillRect(Math.random() * 128, Math.random() * 128, 2, 2);
  }
  const tex = new THREE.CanvasTexture(c);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(24, 4);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

function sea() {
  const c = document.createElement('canvas');
  c.width = 128;
  c.height = 128;
  const g = c.getContext('2d');
  g.fillStyle = '#1e6f8e';
  g.fillRect(0, 0, 128, 128);
  g.strokeStyle = 'rgba(255,255,255,0.25)';
  for (let i = 0; i < 14; i++) {
    const y = Math.random() * 128;
    g.beginPath();
    g.moveTo(0, y);
    g.bezierCurveTo(40, y + 6, 80, y - 6, 128, y);
    g.stroke();
  }
  const tex = new THREE.CanvasTexture(c);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(18, 6);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

// Street line i (0..8) in world units; block centre i (0..7) in world units.
export function streetAt(i) {
  return (i - 4) * TUNE.SPACING;
}
export function blockAt(i) {
  return (i - 3.5) * TUNE.SPACING;
}

// Which district a block (bx, bz in 0..7) belongs to.
export function districtOf(bx, bz) {
  if (bx >= 3 && bx <= 4 && bz >= 3 && bz <= 4) return 'downtown';
  if (bx <= 1 && bz >= 5) return 'marina';
  if (bx >= 6 && bz <= 1) return 'airfield';
  if (bx >= 6 && bz >= 5) return 'harbour';
  if (bz >= 6) return 'beachside';
  return 'residential';
}

export class World {
  constructor(scene, seed = 20261117) {
    this.scene = scene;
    this.rng = makeRng(seed);
    this.colliders = []; // {x0, z0, x1, z1}
    this.roadLines = [];
    for (let i = 0; i < TUNE.GRID; i++) this.roadLines.push(streetAt(i));
    this.markers = {};
    this.group = new THREE.Group();
    scene.add(this.group);

    this.makeGround();
    this.makeRoads();
    this.makeBlocks();
    this.makeBeach();
    this.makePierAndMarina();
    this.makeAirfield();
    this.makeStreetProps();
    this.makeSky();
  }

  addCollider(x0, z0, x1, z1) {
    this.colliders.push({ x0, z0, x1, z1 });
  }

  // A box mesh dropped into the city group. opts: {material, ry, shadow, parent}.
  put(w, h, d, color, x, y, z, opts = {}) {
    const mat = opts.material || new THREE.MeshLambertMaterial({ color });
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
    mesh.position.set(x, y, z);
    if (opts.ry) mesh.rotation.y = opts.ry;
    mesh.castShadow = !!opts.shadow;
    mesh.receiveShadow = true;
    (opts.parent || this.group).add(mesh);
    return mesh;
  }

  makeGround() {
    const grass = new THREE.Mesh(
      new THREE.PlaneGeometry(900, 900),
      new THREE.MeshLambertMaterial({ color: 0x6f8f5a }),
    );
    grass.rotation.x = -Math.PI / 2;
    grass.position.set(0, -0.05, 20);
    grass.receiveShadow = true;
    this.group.add(grass);
    // Pale sidewalk slab under the whole grid.
    const slab = new THREE.Mesh(
      new THREE.PlaneGeometry(TUNE.HALF * 2 + 24, TUNE.HALF * 2 + 24),
      new THREE.MeshLambertMaterial({ color: 0x9aa0a3 }),
    );
    slab.rotation.x = -Math.PI / 2;
    slab.position.set(0, 0, 0);
    slab.receiveShadow = true;
    this.group.add(slab);
  }

  makeRoads() {
    const roadMat = new THREE.MeshLambertMaterial({ map: asphalt() });
    const half = TUNE.HALF;
    for (const line of this.roadLines) {
      const along = new THREE.Mesh(
        new THREE.PlaneGeometry(half * 2 + 12, TUNE.STREET_W),
        roadMat,
      );
      along.rotation.x = -Math.PI / 2;
      along.position.set(0, 0.02, line);
      along.receiveShadow = true;
      this.group.add(along);
      const across = new THREE.Mesh(
        new THREE.PlaneGeometry(TUNE.STREET_W, half * 2 + 12),
        roadMat,
      );
      across.rotation.x = -Math.PI / 2;
      across.position.set(line, 0.02, 0);
      across.receiveShadow = true;
      this.group.add(across);
    }
    // Centre dashes: one instanced mesh for every street.
    const dashGeo = new THREE.BoxGeometry(3, 0.06, 0.35);
    const dashMat = new THREE.MeshBasicMaterial({ color: 0xf5e9c8 });
    const spots = [];
    for (const line of this.roadLines) {
      for (let t = -half; t <= half; t += 9) {
        if (this.roadLines.some((r) => Math.abs(t - r) < 7)) continue; // skip crossings
        spots.push([t, line, 0]);
        spots.push([line, t, Math.PI / 2]);
      }
    }
    const dashes = new THREE.InstancedMesh(dashGeo, dashMat, spots.length);
    const m4 = new THREE.Matrix4();
    const q = new THREE.Quaternion();
    const e = new THREE.Euler();
    spots.forEach(([x, z, ry], i) => {
      e.set(0, ry, 0);
      q.setFromEuler(e);
      m4.compose(new THREE.Vector3(x, 0.05, z), q, new THREE.Vector3(1, 1, 1));
      dashes.setMatrixAt(i, m4);
    });
    this.group.add(dashes);
  }

  makeBlocks() {
    const rng = this.rng;
    const matLow = new THREE.MeshLambertMaterial({ map: litWindows('#7a6a58', 0.25) });
    const matMid = new THREE.MeshLambertMaterial({ map: litWindows('#5d6b7a', 0.3) });
    const matTower = new THREE.MeshLambertMaterial({ map: litWindows('#3d4a5c', 0.35) });
    const matWare = new THREE.MeshLambertMaterial({ color: 0x8a7a68 });
    const clubMat = new THREE.MeshLambertMaterial({ color: 0x7a2e6d, emissive: 0x2a0a24 });

    for (let bx = 0; bx < 8; bx++) {
      for (let bz = 0; bz < 8; bz++) {
        const cx = blockAt(bx);
        const cz = blockAt(bz);
        const d = districtOf(bx, bz);
        if (d === 'airfield') continue; // its own builder
        if (d === 'harbour') {
          for (const [dx, dz] of [[-9, -8], [10, 9]]) {
            this.put(20, 9, 14, 0, cx + dx, 4.5, cz + dz, { material: matWare, shadow: true });
            this.addCollider(cx + dx - 10, cz + dz - 7, cx + dx + 10, cz + dz + 7);
          }
          continue;
        }
        if (d === 'marina') {
          for (let k = 0; k < 3; k++) {
            const w = between(rng, 8, 13);
            const dep = between(rng, 8, 12);
            const h = between(rng, 5, 9);
            const x = cx + between(rng, -12, 12);
            const z = cz + between(rng, -12, 12);
            const col = pickFrom(rng, [0xe8d8b0, 0xd8e8e0, 0xf0c8a8, 0xc8d8e8]);
            this.put(w, h, dep, col, x, h / 2, z, { shadow: true });
            this.addCollider(x - w / 2, z - dep / 2, x + w / 2, z + dep / 2);
          }
          continue;
        }
        if (d === 'downtown') {
          const n = 2 + Math.floor(rng() * 3);
          for (let k = 0; k < n; k++) {
            const w = between(rng, 12, 18);
            const dep = between(rng, 12, 18);
            const h = between(rng, 34, 78);
            const x = cx + between(rng, -10, 10);
            const z = cz + between(rng, -10, 10);
            this.put(w, h, dep, 0, x, h / 2, z, { material: matTower, shadow: true });
            this.addCollider(x - w / 2, z - dep / 2, x + w / 2, z + dep / 2);
          }
          // Club Azahar sits on the central downtown block.
          if (bx === 4 && bz === 4) {
            const club = this.put(16, 7, 12, 0, cx, 3.5, cz, { material: clubMat, shadow: true });
            club.name = 'club-azahar';
            this.addCollider(cx - 8, cz - 6, cx + 8, cz + 6);
            this.markers.club = { x: cx, z: cz - 10, label: 'Club Azahar' };
          }
          continue;
        }
        // Residential and beachside: small houses with pitched roofs.
        const n = 2 + Math.floor(rng() * 3);
        for (let k = 0; k < n; k++) {
          const w = between(rng, 8, 14);
          const dep = between(rng, 8, 13);
          const h = between(rng, 5, 12);
          const x = cx + between(rng, -12, 12);
          const z = cz + between(rng, -12, 12);
          const col = pickFrom(rng, [0xd8c8a8, 0xc8b89a, 0xe0d8c8, 0xb8c8a8]);
          this.put(w, h, dep, col, x, h / 2, z, { material: matLow, shadow: true });
          const roof = new THREE.Mesh(
            new THREE.ConeGeometry(Math.max(w, dep) * 0.72, 3, 4),
            new THREE.MeshLambertMaterial({ color: pickFrom(rng, [0x8a4a3a, 0x5a6a7a, 0x7a5a3a]) }),
          );
          roof.position.set(x, h + 1.5, z);
          roof.rotation.y = Math.PI / 4;
          this.group.add(roof);
          this.addCollider(x - w / 2, z - dep / 2, x + w / 2, z + dep / 2);
        }
      }
    }
    // Piper's garage, downtown south edge, and the gold coupe lot beside it.
    const gx = blockAt(4);
    const gz = streetAt(6) + 10;
    this.put(18, 6, 12, 0, gx, 3, gz, {
      material: new THREE.MeshLambertMaterial({ color: 0x4a6a8a }),
      shadow: true,
    });
    this.addCollider(gx - 9, gz - 6, gx + 9, gz + 6);
    this.markers.garage = { x: gx, z: gz - 10, label: "Piper's Garage" };
    this.markers.coupeLot = { x: gx + 16, z: gz, label: 'Gold Coupe' };
    void matMid;
  }

  makeBeach() {
    const sandMesh = new THREE.Mesh(
      new THREE.PlaneGeometry(560, 60),
      new THREE.MeshLambertMaterial({ map: sand() }),
    );
    sandMesh.rotation.x = -Math.PI / 2;
    sandMesh.position.set(0, 0.03, TUNE.BEACH_Z + 30);
    sandMesh.receiveShadow = true;
    this.group.add(sandMesh);

    this.waterTex = sea();
    const water = new THREE.Mesh(
      new THREE.PlaneGeometry(900, 300),
      new THREE.MeshLambertMaterial({ map: this.waterTex, transparent: true, opacity: 0.92 }),
    );
    water.rotation.x = -Math.PI / 2;
    water.position.set(0, 0.02, TUNE.SEA_Z + 150);
    this.group.add(water);

    const walk = new THREE.Mesh(
      new THREE.PlaneGeometry(560, 8),
      new THREE.MeshLambertMaterial({ color: 0x9a7a52 }),
    );
    walk.rotation.x = -Math.PI / 2;
    walk.position.set(0, 0.06, TUNE.BEACH_Z + 4);
    walk.receiveShadow = true;
    this.group.add(walk);
    this.markers.beach = { x: -40, z: TUNE.BEACH_Z + 24, label: 'Solbay Beach' };
    this.plantPalms(-240, 240, TUNE.BEACH_Z + 12, 26);
  }

  plantPalms(x0, x1, z, step) {
    const rng = this.rng;
    const trunkGeo = new THREE.CylinderGeometry(0.25, 0.4, 6, 6);
    const trunkMat = new THREE.MeshLambertMaterial({ color: 0x6a4a2a });
    const leafGeo = new THREE.ConeGeometry(3.2, 3.4, 7);
    const leafMat = new THREE.MeshLambertMaterial({ color: 0x2e7a3a });
    const spots = [];
    for (let x = x0; x <= x1; x += step) {
      spots.push([x + between(rng, -6, 6), z + between(rng, -2, 2)]);
    }
    const trunks = new THREE.InstancedMesh(trunkGeo, trunkMat, spots.length);
    const leaves = new THREE.InstancedMesh(leafGeo, leafMat, spots.length);
    const m4 = new THREE.Matrix4();
    const q = new THREE.Quaternion();
    spots.forEach(([x, zz], i) => {
      m4.compose(new THREE.Vector3(x, 3, zz), q, new THREE.Vector3(1, 1, 1));
      trunks.setMatrixAt(i, m4);
      m4.compose(new THREE.Vector3(x, 7.2, zz), q, new THREE.Vector3(1, 1, 1));
      leaves.setMatrixAt(i, m4);
    });
    trunks.castShadow = true;
    this.group.add(trunks, leaves);
  }

  makePierAndMarina() {
    const rng = this.rng;
    // The pier runs from the boardwalk out into the water.
    const pierX = -120;
    for (let z = TUNE.BEACH_Z + 8; z < TUNE.SEA_Z + 60; z += 4) {
      this.put(10, 0.5, 3.6, 0x8a6a42, pierX, 1.2, z);
    }
    for (let z = TUNE.BEACH_Z + 12; z < TUNE.SEA_Z + 60; z += 12) {
      this.put(0.5, 2.4, 0.5, 0x5a4030, pierX - 4.6, 0, z);
      this.put(0.5, 2.4, 0.5, 0x5a4030, pierX + 4.6, 0, z);
    }
    this.markers.pier = { x: pierX, z: TUNE.SEA_Z + 30, label: 'Solbay Pier' };
    // Marina docks along the west edge, each with a moored boat.
    const dockX = -TUNE.HALF - 6;
    for (let z = 60; z <= 200; z += 28) {
      this.put(3, 0.5, 18, 0x8a6a42, dockX, 1.0, z);
      const boat = new THREE.Group();
      const hull = new THREE.Mesh(
        new THREE.BoxGeometry(4, 1.6, 12),
        new THREE.MeshLambertMaterial({ color: pickFrom(rng, [0xe8e8e8, 0x2a6a8a, 0xc84a3a]) }),
      );
      hull.position.y = 0.8;
      const cabin = new THREE.Mesh(
        new THREE.BoxGeometry(2.6, 1.4, 4),
        new THREE.MeshLambertMaterial({ color: 0xf0f0f0 }),
      );
      cabin.position.set(0, 2.2, -1);
      const mast = new THREE.Mesh(
        new THREE.CylinderGeometry(0.08, 0.08, 7, 5),
        new THREE.MeshLambertMaterial({ color: 0x888888 }),
      );
      mast.position.set(0, 5, 1);
      boat.add(hull, cabin, mast);
      boat.position.set(dockX - 6, 0.4, z + 4);
      boat.rotation.y = between(rng, -0.1, 0.1);
      this.group.add(boat);
    }
    this.markers.marina = { x: dockX - 4, z: 120, label: 'Marina' };
  }

  makeAirfield() {
    const ax = blockAt(7);
    const az = blockAt(0);
    const runway = new THREE.Mesh(
      new THREE.PlaneGeometry(20, 130),
      new THREE.MeshLambertMaterial({ color: 0x2e2e33 }),
    );
    runway.rotation.x = -Math.PI / 2;
    runway.position.set(ax + 10, 0.04, az);
    runway.receiveShadow = true;
    this.group.add(runway);
    for (let z = az - 55; z <= az + 55; z += 12) {
      this.put(1, 0.06, 5, 0xf0f0f0, ax + 10, 0.07, z);
    }
    for (const [dx, dz] of [[-14, -30], [-14, 30]]) {
      this.put(16, 10, 22, 0, ax + dx, 5, az + dz, {
        material: new THREE.MeshLambertMaterial({ color: 0x7d8a94 }),
        shadow: true,
      });
      this.addCollider(ax + dx - 8, az + dz - 11, ax + dx + 8, az + dz + 11);
    }
    // A small prop plane waiting at the runway end — the story's finish line.
    const plane = new THREE.Group();
    const fus = new THREE.Mesh(
      new THREE.CylinderGeometry(0.9, 0.6, 9, 8),
      new THREE.MeshLambertMaterial({ color: 0xd8d8d8 }),
    );
    fus.rotation.x = Math.PI / 2;
    const wing = new THREE.Mesh(
      new THREE.BoxGeometry(12, 0.25, 2),
      new THREE.MeshLambertMaterial({ color: 0xc84a3a }),
    );
    const tail = new THREE.Mesh(
      new THREE.BoxGeometry(4, 0.2, 1.4),
      new THREE.MeshLambertMaterial({ color: 0xc84a3a }),
    );
    tail.position.set(0, 0.4, -4.4);
    const prop = new THREE.Mesh(
      new THREE.BoxGeometry(0.3, 3.4, 0.3),
      new THREE.MeshLambertMaterial({ color: 0x222222 }),
    );
    prop.position.set(0, 0, 4.8);
    plane.add(fus, wing, tail, prop);
    plane.position.set(ax + 10, 1.2, az + 48);
    plane.rotation.y = Math.PI;
    this.group.add(plane);
    this.markers.airfield = { x: ax + 10, z: az + 48, label: 'Solbay Airfield' };
    this.markers.hangar = { x: ax - 14, z: az + 30, label: 'Hangar 2' };
  }

  makeStreetProps() {
    const rng = this.rng;
    // Streetlights at every intersection corner.
    const poleGeo = new THREE.CylinderGeometry(0.12, 0.16, 7, 6);
    const poleMat = new THREE.MeshLambertMaterial({ color: 0x3a3f45 });
    const headGeo = new THREE.SphereGeometry(0.35, 8, 6);
    const headMat = new THREE.MeshBasicMaterial({ color: 0xffe9a8 });
    const spots = [];
    for (const x of this.roadLines) {
      for (const z of this.roadLines) spots.push([x + 7, z + 7]);
    }
    const poles = new THREE.InstancedMesh(poleGeo, poleMat, spots.length);
    const heads = new THREE.InstancedMesh(headGeo, headMat, spots.length);
    const m4 = new THREE.Matrix4();
    const q = new THREE.Quaternion();
    spots.forEach(([x, z], i) => {
      m4.compose(new THREE.Vector3(x, 3.5, z), q, new THREE.Vector3(1, 1, 1));
      poles.setMatrixAt(i, m4);
      m4.compose(new THREE.Vector3(x, 7.1, z), q, new THREE.Vector3(1, 1, 1));
      heads.setMatrixAt(i, m4);
    });
    this.group.add(poles, heads);
    // Scattered crates in alleys (never on a road).
    const crateMat = new THREE.MeshLambertMaterial({ color: 0x9a7a4a });
    for (let i = 0; i < 26; i++) {
      const x = between(rng, -220, 220);
      const z = between(rng, -220, 220);
      if (this.roadLines.some((r) => Math.abs(x - r) < 8)) continue;
      if (this.roadLines.some((r) => Math.abs(z - r) < 8)) continue;
      const s = between(rng, 1, 2);
      this.put(s, s, s, 0, x, s / 2, z, { material: crateMat });
      this.addCollider(x - s / 2, z - s / 2, x + s / 2, z + s / 2);
    }
    // Side-job ranks.
    this.markers.taxi = { x: streetAt(2) + 8, z: streetAt(4) - 8, label: 'Taxi Rank' };
    this.markers.parcel = { x: blockAt(6), z: streetAt(7) + 8, label: 'Parcel Depot' };
    this.markers.warehouse = { x: blockAt(7), z: blockAt(6), label: 'Harbour Warehouse' };
  }

  makeSky() {
    this.sun = new THREE.DirectionalLight(0xfff2d8, 2.4);
    this.sun.position.set(180, 260, 120);
    this.sun.castShadow = true;
    this.sun.shadow.mapSize.set(1024, 1024);
    this.sun.shadow.camera.left = -260;
    this.sun.shadow.camera.right = 260;
    this.sun.shadow.camera.top = 260;
    this.sun.shadow.camera.bottom = -260;
    this.sun.shadow.camera.far = 800;
    this.scene.add(this.sun);
    this.scene.add(new THREE.HemisphereLight(0xbfd8ff, 0x8a7a5a, 0.9));
    this.scene.fog = new THREE.Fog(0xcfe0ea, 320, 720);
    this.scene.background = new THREE.Color(0x87b5d8);
  }

  // Push a circle (player or car) out of every building box it overlaps.
  collideCircle(x, z, r) {
    for (const c of this.colliders) {
      const nx = Math.max(c.x0, Math.min(x, c.x1));
      const nz = Math.max(c.z0, Math.min(z, c.z1));
      const dx = x - nx;
      const dz = z - nz;
      const d2 = dx * dx + dz * dz;
      if (d2 < r * r) {
        if (d2 > 1e-6) {
          const d = Math.sqrt(d2);
          x = nx + (dx / d) * r;
          z = nz + (dz / d) * r;
        } else {
          // Centre is inside the box: shove out along the shallowest side.
          const pl = x - c.x0;
          const pr = c.x1 - x;
          const pt = z - c.z0;
          const pb = c.z1 - z;
          const m = Math.min(pl, pr, pt, pb);
          if (m === pl) x = c.x0 - r;
          else if (m === pr) x = c.x1 + r;
          else if (m === pt) z = c.z0 - r;
          else z = c.z1 + r;
        }
      }
    }
    // Island bounds: the beach runs south, the sea blocks the far south.
    const B = TUNE.HALF + 14;
    x = Math.max(-B - 40, Math.min(B + 40, x));
    z = Math.max(-B - 14, Math.min(TUNE.SEA_Z + 40, z));
    return { x, z };
  }

  // The street line nearest to a point, for traffic and pedestrian lane logic.
  nearestRoad(x, z) {
    let best = null;
    for (const line of this.roadLines) {
      const dz = Math.abs(z - line);
      if (!best || dz < best.d) best = { axis: 'z', coord: line, d: dz };
      const dx = Math.abs(x - line);
      if (dx < best.d) best = { axis: 'x', coord: line, d: dx };
    }
    return best;
  }

  update(dt, elapsed) {
    // Slow sun drift and a shimmering sea.
    const t = elapsed * 0.02;
    this.sun.position.set(180 * Math.cos(t * 0.2), 260, 120 + 60 * Math.sin(t * 0.2));
    if (this.waterTex) this.waterTex.offset.x = (elapsed * 0.008) % 1;
    void dt;
  }
}
