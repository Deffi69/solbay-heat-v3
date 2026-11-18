// SOLBAY HEAT — the numbers that tune the game. One place to change how the city
// feels: how fast you run and drive, how hot the police get, what a job pays.
export const TUNE = {
  // City: a 9-by-9 street grid, streets 52 units apart, 12 wide, blocks 40 wide.
  GRID: 9,
  SPACING: 52,
  STREET_W: 12,
  BLOCK: 40,
  HALF: 4 * 52 + 26, // 234: half the street grid's extent
  BEACH_Z: 234, // sand starts just south of the last street
  SEA_Z: 268, // open water beyond the sand

  // On foot
  WALK: 7,
  SPRINT: 11,
  JUMP: 9,
  GRAVITY: 24,
  BODY_R: 0.7,
  MAX_HEALTH: 100,

  // Cars
  ACCEL: 16,
  TOP_SPEED: 34,
  REVERSE_MAX: 10,
  BRAKE: 30,
  TURN_RATE: 1.9,
  TRAFFIC_SPEED: 9,

  // Wanted
  MAX_STARS: 5,
  HEAT_STEAL: 40,
  HEAT_SHOT: 12,
  HEAT_HIT_PED: 25,
  HEAT_KILL: 35,
  HEAT_COOL: 2.2,
  STAR_AT: [0, 30, 80, 150, 240, 360], // heat needed for 0..5 stars

  // Combat
  GUN_DAMAGE: 34,
  GUN_HEADSHOT: 100,
  GUN_MAG: 12,
  GUN_RANGE: 90,
  FIST_DAMAGE: 12,
  FIST_REACH: 2.2,

  // Money
  START_CASH: 250,
  FARE_PER_M: 2,
  PARCEL_PAY: 180,
  MISSION_PAY: [300, 450, 600, 800, 1500],
  BUST_FINE: 200,
  HOSPITAL: 150,

  // Ambience
  DAY_SECONDS: 240,
};

export const PLACE_NAMES = {
  downtown: 'Downtown Solbay',
  marina: 'Marina',
  beach: 'Solbay Beach',
  harbour: 'Harbour',
  airfield: 'Solbay Airfield',
  residential: 'Palm Court',
};

export const CAST = {
  hero: 'Reno Vale',
  contact: 'Marisol Cruz',
  mechanic: 'Piper Lang',
  gang: 'the Corsairs',
  club: 'Club Azahar',
};
