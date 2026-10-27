// All tunable numbers live here. Change a value, save, and Live Server reloads the game.
// Units: 1 world unit ≈ 10 m on the road, speed is world units per second.

export const CFG = {
  bus: {
    startSpeed: 12,      // speed the bus has when a run begins
    maxSpeed: 38,        // normal top speed
    boostSpeed: 55,      // top speed while boosting
    accel: 15,           // speed gained per second while holding drive
    boostAccel: 20,      // extra acceleration while boosting
    brake: 32,           // speed lost per second while braking
    drag: 2.5,           // speed lost per second when nothing is pressed
    emptyTankDrag: 12,   // drag when fuel is empty (bus rolls to a stop)
    overSpeedDecel: 15,  // how fast the bus drops back to maxSpeed after a boost
    steerSpeed: 13,      // sideways speed when steering
    steerMinFactor: 0.3, // steering strength at standstill (0..1)
    steerFullAt: 15,     // speed at which steering reaches full strength
    maxX: 5.5,           // how far left/right the bus can go
    leanAngle: 0.12,     // how much the bus turns its nose when steering (radians)
    leanSmoothing: 8,    // higher = nose turns back faster
    hitHalfWidth: 1.25,  // collision box half width
    hitHalfLength: 3.4,  // collision box half length
  },

  fuel: {
    max: 100,
    baseDrain: 0.8,      // fuel used per second even when slow
    speedDrain: 1.4,     // extra drain at speed 40 (scales with speed)
    speedDrainRef: 40,   // the speed where speedDrain is reached
    boostDrain: 2,       // extra drain per second while boosting
    drumAmount: 40,      // fuel given by one blue drum
  },

  hp: {
    max: 100,
    hitDamageScale: 1,   // multiply all crash damage (higher = harder)
    hitBase: 0.5,        // damage multiplier at speed 0...
    hitSpeedRef: 40,     // ...plus 1 more for every 40 speed
    hitSpeedKeep: 0.6,   // fraction of speed kept after a crash
    hitShake: 0.6,       // camera shake strength after a crash
  },

  fare: {
    perPassenger: 10,     // taka for each passenger who boards
    travelRate: 0.015,    // taka per passenger per unit of speed per second
    maxPassengers: 30,
    lostOnHit: 2,         // passengers who leave after a crash
  },

  traffic: {
    firstSpawnDelay: 1,   // seconds before the first vehicle appears
    startInterval: 1.5,   // seconds between vehicles at the start
    minInterval: 0.45,    // fastest spawn rate (difficulty cap)
    rampDistance: 3500,   // interval shrinks by 1 s every this much distance
    intervalJitterMin: 0.7,
    intervalJitterMax: 1.3,
    spawnZ: -150,         // how far ahead vehicles appear
    lanes: [-5, -2.5, 0, 2.5, 5],
    laneJitter: 0.4,
    clearZ: 12,           // don't spawn if another vehicle is this close (ahead/behind)...
    clearX: 3,            // ...and this close sideways
    despawnBehind: 30,
    despawnAhead: -220,
    despawnSide: 40,
    flingSpeed: 22,       // sideways speed of a vehicle after you hit it
    flingSpin: 6,         // spin speed of a hit vehicle
    wobbleBelow: 6,       // vehicles slower than this wobble (rickshaws)
    wobbleFreq: 2,
    wobbleAmount: 0.6,
    // w/l/h = size, v = own speed, dmg = damage to bus, wt = how often it appears
    types: [
      { name: "rickshaw", w: 1.3, l: 2.6, h: 1.0, v: 5,  dmg: 6,  wt: 4,   colors: [0xff9800, 0x29b6f6, 0xec407a, 0xab47bc] },
      { name: "cng",      w: 1.6, l: 2.8, h: 1.6, v: 12, dmg: 10, wt: 4,   colors: [0x2e9e4f] },
      { name: "car",      w: 1.9, l: 4.2, h: 1.4, v: 15, dmg: 14, wt: 3,   colors: [0xe53935, 0x1e88e5, 0xfafafa, 0x424242, 0xfdd835] },
      { name: "truck",    w: 2.6, l: 8,   h: 3.0, v: 9,  dmg: 24, wt: 1.5, colors: [0xf57c00, 0x5d4037, 0x1565c0] },
    ],
  },

  stops: {
    first: 120,           // distance of the first bus stop
    gapMin: 250,          // distance between stops
    gapMax: 400,
    sideX: 5,             // stops sit this far left or right of centre
    people: 5,            // passengers waiting at each stop
    boardMaxSpeed: 10,    // bus must be slower than this to board passengers
    boardInterval: 0.35,  // seconds between two passengers boarding
    reachX: 2.4,          // how close (sideways) the bus must be to the stop
    reachZ: 8,            // how close (along the road)
    slowWarnCooldown: 1.5,
    despawnBehind: 25,
  },

  drums: {
    first: 250,
    gapMin: 350,
    gapMax: 550,
    rangeX: 5,            // drums appear anywhere between -rangeX and +rangeX
    reachX: 2.2,
    reachZ: 4,
    spin: 3,
    despawnBehind: 20,
  },

  world: {
    roadHalfWidth: 7,
    skyColor: 0xcfe3ee,
    fogNear: 50,
    fogFar: 170,
    idleScrollSpeed: 10,  // road scroll speed behind the title screen
    stripeCount: 30,
    stripeGap: 10,
    stripeLanesX: [-3.5, 3.5],
    stripeRecycleAt: 20,  // when a stripe passes this z behind the camera...
    buildingCount: 40,
    buildingGap: 15,
    buildingRecycleAt: 25,
    recycleLength: 300,   // ...it jumps this far forward again
    buildingColors: [0xd7ccc8, 0xffe0b2, 0xb0bec5, 0xc5e1a5, 0xf8bbd0, 0xbcaaa4],
  },

  camera: {
    fov: 70,              // starting field of view
    baseFov: 68,          // field of view at speed 0...
    fovPerSpeed: 0.35,    // ...widened by this much per unit of speed
    followX: 0.6,         // how much the camera follows the bus sideways (0..1)
    height: 6.2,
    distance: 13,
    lookY: 1.5,
    lookZ: -14,
    shakeDecay: 1.5,      // how fast shake fades
    far: 300,
  },

  render: {
    maxPixelRatio: 2,     // lower to 1 for more speed on phones
    maxDt: 0.05,          // longest frame step (stops huge jumps after lag)
  },

  hud: {
    kmhPerSpeed: 2.2,     // converts speed to the km/h number shown
    unitsPerKm: 100,      // converts distance to the km number shown
  },
};
