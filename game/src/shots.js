// ?shot= scene staging for the maker's screenshots. Each scene puts the player, cars,
// police and camera in their marks, lets the world settle a few frames, then raises
// window.__shotReady so the screenshot rig can capture it.
import { TUNE } from './config.js';
import { streetAt } from './world.js';

export const SHOT_NAMES = ['cover', 'foot', 'drive', 'chase'];

function placePlayer(game, x, z, heading, camYaw) {
  game.player.reset(x, z, heading);
  game.player.camYaw = camYaw ?? heading;
  game.player.camPitch = 0.32;
}

export function applyShot(name, game) {
  const { world, player, traffic, police, missions } = game;
  if (name === 'cover') {
    // Wide downtown vista: the hero beside the gold coupe on the avenue, towers ahead.
    const coupe = traffic.cars.find((c) => c.isStoryCoupe) || traffic.cars[0];
    coupe.x = streetAt(4);
    coupe.z = streetAt(5);
    coupe.heading = Math.PI;
    coupe.syncMesh();
    placePlayer(game, streetAt(4) - 4, streetAt(5) + 10, Math.PI * 0.95, Math.PI * 0.95);
    player.camDist = 10;
    player.camPitch = 0.36;
    game.started = true;
    missions.startStory();
  } else if (name === 'foot') {
    // On foot on a downtown street, pedestrians strolling, traffic passing by.
    placePlayer(game, streetAt(4) + 3, streetAt(3) + 10, Math.PI * 0.9, Math.PI * 0.9);
    player.camDist = 9;
    player.camPitch = 0.38;
    game.started = true;
    missions.startStory();
  } else if (name === 'drive') {
    // Driving down the main avenue with traffic around; auto-throttle keeps it rolling.
    let car = null;
    let bd = Infinity;
    for (const c of traffic.cars) {
      if (c.driver !== 'traffic') continue;
      const d = (c.x - streetAt(4)) ** 2 + (c.z - streetAt(2)) ** 2;
      if (d < bd) {
        bd = d;
        car = c;
      }
    }
    if (car) {
      car.x = streetAt(4);
      car.z = streetAt(2);
      car.heading = 0;
      car.speed = 16;
      car.syncMesh();
      player.reset(car.x, car.z, 0);
      player.tryEnterCar(car);
    } else {
      placePlayer(game, streetAt(4), streetAt(2), 0, 0);
    }
    game.autoDrive = true;
    player.camDist = 10;
    player.camPitch = 0.2;
    game.started = true;
    missions.startStory();
  } else if (name === 'chase') {
    // Four-star chase: the hero in the gold coupe, PD interceptors closing in.
    const coupe = traffic.cars.find((c) => c.isStoryCoupe) || traffic.cars[0];
    coupe.x = streetAt(4);
    coupe.z = streetAt(6);
    coupe.heading = Math.PI / 2;
    coupe.syncMesh();
    player.reset(coupe.x, coupe.z, coupe.heading);
    player.tryEnterCar(coupe);
    coupe.speed = 22;
    game.autoDrive = true;
    police.addHeat(300);
    police.spawnPursuitCar(player.pos);
    police.spawnPursuitCar(player.pos);
    police.spawnFootCop(player.pos);
    player.camDist = 11;
    player.camPitch = 0.3;
    game.started = true;
    missions.startStory();
    game.hud.say(
      'MARISOL',
      '"Last one, Reno. Four stars on us already — get to the plane and don\'t stop."',
      6,
    );
    game.hud.setObjective('Solbay Goodbye — Escape to the plane on the runway!');
  } else {
    return false;
  }
  game.showTitle(false);
  return true;
}

// After staging, let the simulation settle, then flag readiness for the rig.
export function armShotReady(game, frames = 45) {
  let n = 0;
  const tick = () => {
    if (++n >= frames) {
      window.__shotReady = true;
      return;
    }
    requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
  void game;
  void TUNE;
}
