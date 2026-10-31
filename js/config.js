// All tunable numbers live here. Change a value, save, and Live Server reloads the game.
// Units: 1 world unit ≈ 10 m on the road, speed is world units per second.

export const CFG = {
  bus: {
    // --- Speed ---
    startSpeed: 12,      // speed the bus has when a run begins
    maxSpeed: 38,        // normal top speed
    boostSpeed: 55,      // top speed while boosting
    accel: 11,           // engine pull at low speed (a heavy bus pulls gently)
    boostAccel: 16,      // extra pull while boosting
    brake: 30,           // speed lost per second with full brake
    rollDrag: 1.5,       // speed lost per second when coasting
    airDrag: 0.0012,     // extra drag that grows with speed², so top speed feels soft
    emptyTankDrag: 12,   // drag when fuel is empty (bus rolls to a stop)
    overSpeedDecel: 12,  // how fast the bus drops back to maxSpeed after a boost
    boostHold: 1.2,      // boost (and auto-drive) keeps going this long after you let go,
                         // so your hand can move to the steering keys

    // --- Turning (the bus has a real heading) ---
    turnRadiusMin: 9,       // tightest turning circle, at walking speed
    turnRadiusPerSpeed: 0.45, // the circle grows this much per unit of speed (heavy bus)
    alignRate: 1.8,         // with no steering, the bus lines up with the road at this rate
    maxRelYaw: 0.5,         // the most the bus can point away from the road (radians)

    // --- Road edge (soft bump instead of a wall) ---
    edgeInset: 1.8,      // the kerb starts pushing this far inside the road edge
    edgeHardInset: 1.2,  // the bus centre never gets closer to the edge than this
    edgeYawPush: 0.6,    // how hard the kerb turns the nose back in
    edgeScrapeDrag: 8,   // speed lost per second while scraping
    edgeShake: 0.12,     // small camera shake while scraping

    // --- Look only (never changes the collision box) ---
    rollPerSideSpeed: 0.012,// body leans outwards in a turn
    pitchPerAccel: 0.004,   // nose dips when braking, lifts when speeding up
    maxPitch: 0.06,
    visualSmoothing: 6,     // higher = body movement follows faster
    wheelRadius: 0.55,
    brakeLightGlow: 2.5,    // tail light brightness while braking

    // --- Collision & Bus HP (Body / Windows) ---
    hitHalfWidth: 1.25,  // collision box half width
    hitHalfLength: 3.4,  // collision box half length
    maxHp: 100,          // bus body & window health (0..100)
    crashHpLoss: 6,      // HP lost on a light crash
    projectileHpLoss: 14,// HP lost when a thrown brick/sandal/cup hits the bus
    stageHpRepair: 20,   // HP patched up by the helper at each stage checkpoint
    lowHp: 35,           // below this the HP bar pulses gently
    autoHealDelay: 3.0,  // seconds of clean driving (no crashes/hits) before bus health begins auto-restoring
    autoHealRate: 15,    // HP recovered per second once auto-restore begins (smooth refill to 100)
  },

  fuel: {
    max: 100,
    baseDrain: 0.8,      // fuel used per second even when slow
    speedDrain: 1.4,     // extra drain at speed 40 (scales with speed)
    speedDrainRef: 40,   // the speed where speedDrain is reached
    boostDrain: 2,       // extra drain per second while boosting
  },

  hit: {
    shake: 0.6,          // camera shake strength after a crash
    vibrateMs: 80,       // phone vibration on a crash (0 = off)
    invulnTime: 0.6,     // seconds after a hit when nothing else can hit you (no chain crashes)
  },

  // Bumping light things (rickshaw, bike, CNG, car, stall).
  // Mass decides who flies: the bus is heavy, so small things get launched and the bus barely slows.
  impact: {
    busMass: 10,
    slowFactor: 1.6,     // bus speed lost = slowFactor × (their mass / total mass)
    pushForward: 1.2,    // how hard a hit object is shoved ahead
    flingSide: 10,       // base sideways launch speed
    flingPerSpeed: 0.35, // extra sideways launch per unit of closing speed
    hop: 5,              // upward launch speed
    gravity: 25,
    spin: 8,             // spin speed of a launched object
    flyDrag: 10,         // how fast a launched object loses its forward speed
    sideDrag: 2,         // how fast it loses its sideways speed
  },

  // Hitting a heavy thing (truck, rival bus, pillar) ends the run with a short slow-motion moment.
  crash: {
    slowMo: 0.25,        // game speed during the crash (0.25 = four times slower)
    realSeconds: 1.4,    // how long the slow-motion lasts in real seconds
    speedKeep: 0.15,     // the bus keeps this much speed at the impact
    shake: 1.2,
    vibrateMs: 250,
  },

  // Red warning light for heavy things ahead.
  warning: {
    time: 1.8,           // warn this many seconds before you would reach it
    minDist: 25,         // ...but never later than this distance
    sideMargin: 1.0,     // also warn if you would only just scrape past
    pulseHz: 2,          // pulse speed (kept under 3 Hz for comfort)
  },

  // Damage score: every light crash adds its `damage` value (see the types below).
  // Crashes close together form a combo that multiplies the score.
  combo: {
    window: 2.5,         // seconds to chain the next crash into the combo
    step: 0.5,           // each combo step adds this to the multiplier (x1, x1.5, x2 ...)
    maxMult: 4,
  },

  // The crowd that chases the bus after a crash. Distances are behind the bus.
  crowd: {
    startGap: 9,         // where the crowd appears after the first crash
    catchGap: 3.6,       // if they get this close (the back of the bus), they catch it
    crashGapCut: 5,      // a new crash during a chase brings them this much closer
    baseSpeed: 14,       // running speed at the first crash
    speedPerCrash: 1.5,  // each extra crash makes them faster...
    maxSpeed: 30,        // ...up to this (bus top speed is 38, so a moving bus can escape)
    baseSize: 6,         // people at the first crash
    sizePerCrash: 3,
    maxSize: 40,         // also the size of the instanced mesh (the most we ever draw)
    escapeGap: 70,       // stay further than this...
    escapeTime: 4,       // ...for this many seconds and they give up
    cueGap: 40,          // the screen-edge cue starts showing within this gap
    spread: 6,           // how deep the crowd is (front runners to the back)
    runBobHz: 3,         // running bounce speed
    runBob: 0.25,        // running bounce height
    ringRadius: 4.2,     // when they catch the bus, they stand around it in a ring this wide
    caughtSeconds: 3.8,  // dramatic "গণধোলাই / ঘেরাও" cutscene before the newspaper screen
    ringSpeed: 6,        // how fast they walk into the ring

    // Thrown cartoon projectiles (brick, helmet, sandal, bottle, tea cup) from the chasing crowd.
    throwMaxGap: 34,     // crowd throws items when closer than this distance behind the bus
    throwMinGap: 5,
    throwInterval: 1.35, // seconds between throws while in range
    throwFlightTime: 0.75,// seconds a thrown item takes to reach the bus
    throwArcHeight: 2.8, // peak height of the ballistic arc above the road
    throwLeadJitter: 0.9,// sideways aim scatter (steering sideways dodges the throw!)
    projectilePool: 10,  // pre-allocated projectile meshes (reused, zero GC)
    shardPool: 16,       // pre-allocated cartoon glass shard particles on window hit
  },

  journey: {
    checkpointPenalty: 0.1, // restarting from a checkpoint keeps 90% of score and fare
    cardSeconds: 3.5,       // how long the stage-title card stays up
    passengersOffShare: 0.5,// at each checkpoint about half the passengers get off...
    passengersOnMin: 3,     // ...and this many new ones get on
    passengersOnMax: 8,
    spawnAhead: 170,        // landmarks appear this far ahead (just inside the fog)
    finishSlack: 1,         // the journey ends this close to the end of the last road
    landmarkClear: 25,      // around a one-sided landmark, normal buildings stay away this far
    despawnBehind: 45,
  },

  audio: {
    volume: 0.6,          // master volume (0..1)
    hornNote1: [440, 554],// the two notes of the horn, each a small chord (Hz)
    hornNote2: [392, 494],
    hornLength: 0.16,     // seconds per note
    hornGain: 0.25,
    hornTone: 2200,       // higher = brighter, harsher horn
    slapGain: 0.9,
  },

  // Horn and the "ওস্তাদ shout" button.
  horn: {
    cooldown: 0.45,       // seconds between two horns
    reach: 35,            // light vehicles this far ahead in your lane move aside
  },
  shout: {
    cooldown: 2.5,        // seconds between two shouts
    seconds: 2.4,         // how long the bubble stays
  },

  // The newspaper end screen.
  paper: {
    bigCombo: 4,          // a combo this big can make the headline
    highDamage: 300,      // so can this much Damage
    specialChance: 0.5,   // chance to use a "special" headline when one fits
    generalChance: 0.15,  // otherwise, chance of a general headline instead of one about the ending
    photoQuality: 0.8,    // JPEG quality of the snapshot on the page
  },

  speech: {
    rudeness: 1,          // 0 = no insults, 1 = mild banter (default), 2 = louder street banter
    subtitleSeconds: 2.2, // how long a line stays on screen
    crowdShoutEvery: 2.5, // seconds between crowd shouts while they are close
    bubbleX: 1.3,         // where the bubble sits: next to the front door of the bus...
    bubbleY: 3.6,         // ...above the roof...
    bubbleZ: -2.6,        // ...near the front
  },

  fare: {
    perPassenger: 10,    // taka for each passenger who boards
    travelRate: 0.015,    // taka per passenger per unit of speed per second
    maxPassengers: 30,
  },

  traffic: {
    firstSpawnDelay: 1,   // seconds before the first vehicle appears
    startInterval: 1.5,   // seconds between vehicles at the start
    minInterval: 0.45,    // fastest spawn rate (difficulty cap)
    rampDistance: 3500,   // interval shrinks by 1 s every this much distance
    intervalJitterMin: 0.7,
    intervalJitterMax: 1.3,
    spawnAhead: 150,      // how far ahead (along the road) vehicles appear
    lanes: [-5, -2.5, 0, 2.5, 5],
    laneWidth: 2.5,       // distance between two lanes (used when vehicles change lane)
    laneJitter: 0.4,
    clearZ: 12,           // don't spawn if another vehicle is this close (ahead/behind)...
    clearX: 3,            // ...and this close sideways
    despawnBehind: 30,
    despawnAhead: -220,
    despawnSide: 30,      // removed when this far outside the road edge
    followGap: 6,         // a vehicle slows down if another is this close in front of it
    speedResponse: 2,     // how quickly vehicles change speed
    laneResponse: 1.5,    // how quickly vehicles slide into a new lane
    avoidDist: 30,        // vehicles change lane this far before a pillar

    // Heavy hazards (trucks, rival buses) get more common the further you go.
    heavyStartDist: 350,  // none at all before this distance (an easy first ~20 seconds)
    heavyRampDist: 2000,  // their chance grows over this distance...
    heavyMaxScale: 2,     // ...up to this many times their base weight
    heavyGap: 30,         // never two heavy vehicles this close, so there's always a way through

    // w/l/h = size, v = own speed, wt = how often it appears, mass = for launching,
    // damage = score for crashing into it (bigger or rarer = more).
    // wobble/weave = side-to-side movement, laneChange = chance per second to switch lane.
    types: [
      { name: "rickshaw", shape: "rickshaw", w: 1.3, l: 2.6, h: 1.0, v: 5,  wt: 4,   mass: 0.4, damage: 10,
        wobble: 0.6, wobbleFreq: 2, colors: [0xff9800, 0x29b6f6, 0xec407a, 0xab47bc] },
      { name: "bike",     shape: "bike",     w: 0.8, l: 2.0, h: 1.3, v: 16, wt: 2.5, mass: 0.3, damage: 15,
        wobble: 1.2, wobbleFreq: 1.5, colors: [0x212121, 0xd32f2f, 0x1565c0] },
      { name: "cng",      shape: "car",      w: 1.6, l: 2.8, h: 1.6, v: 12, wt: 3.5, mass: 0.6, damage: 20,
        laneChange: 0.25, colors: [0x2e9e4f] },
      { name: "car",       shape: "car",       w: 1.9, l: 4.2, h: 1.4,  v: 15, wt: 3,    mass: 1.5, damage: 30,
        colors: [0xe53935, 0x1e88e5, 0xfafafa, 0x424242, 0xfdd835] },
      { name: "vip",       shape: "vip",       w: 2.0, l: 4.6, h: 1.55, v: 17, wt: 0.85, mass: 1.8, damage: 120,
        laneChange: 0.2, colors: [0x111111, 0x1c2833] },
      { name: "policeCar", shape: "policeCar", w: 1.95, l: 4.4, h: 1.5, v: 18, wt: 0.7,  mass: 1.7, damage: 80,
        laneChange: 0.25, colors: [0x1a237e] },
      { name: "truck",     shape: "truck",     w: 2.6, l: 8,   h: 3.0,  v: 9,  wt: 1.2,  heavy: true,
        colors: [0xf57c00, 0x5d4037, 0x1565c0] },
      { name: "bus",       shape: "bus",       w: 2.6, l: 7.5, h: 2.8,  v: 11, wt: 1,    heavy: true,
        colors: [0xc62828, 0x1565c0, 0x6a1b9a] },
    ],
  },

  // Street hazards & stunt ramps (WASA road trench, open manhole, wooden jump ramp).
  hazards: {
    trenchGapMin: 210, trenchGapMax: 360,
    manholeGapMin: 170, manholeGapMax: 300,
    rampGapMin: 250, rampGapMax: 420,
    rampBonus: 100,      // base damage bonus for launching off a ramp (×10 = ৳1,000)
    mirrorBonus: 30,     // base damage bonus for grazing & snapping a car's side mirror (×10 = ৳300)
    wrongWayMult: 1.5,   // damage multiplier when driving in oncoming lanes (right of the median)
  },

  // Traffic mix on special roads (multiplies each type's chance; 0 = never).
  roadKinds: {
    flyover: { rickshaw: 0, bike: 0.5, truck: 1.5 }, // fast, no rickshaws, but trucks love it
    street: { truck: 0, bus: 0, rickshaw: 1.8 },     // narrow lanes: rickshaws everywhere
  },

  // Small roadside stalls poking into the outer lane. Crashable, and they break apart.
  stall: {
    name: "stall", w: 1.2, l: 2.2, h: 2.2, mass: 0.5, damage: 25,
    edgeOffset: -0.4,     // stall centre sits this far inside the road edge
    gapMin: 60, gapMax: 140,
    colors: [0xe53935, 0x1e88e5, 0x43a047, 0xffb300],
  },

  // Crossing & roadside pedestrians (never crashable; they dodge or jump back onto the pavement).
  pedestrians: {
    gapMin: 55,
    gapMax: 110,
    walkSpeed: 2.6,       // normal walking speed across the road
    dodgeSpeed: 8.8,      // quick scramble speed when the bus approaches or honks
    scareDist: 28,        // distance ahead where an oncoming bus makes them hesitate / dodge
    scareWidth: 3.2,      // sideways margin from the bus centre that triggers a dodge
  },

  // Flyover & metro sections: a row of pillars down the middle of the road with the deck overhead.
  pillar: {
    name: "pillar", w: 1.4, l: 1.4, heavy: true,
    startDist: 450,       // first flyover after this distance
    gapMin: 600, gapMax: 1000,
    countMin: 4, countMax: 7,
    spacing: 22,          // distance between two pillars
    deckY: 7.6,           // height of the flyover / metro deck
    deckWidth: 9,
  },

  // Overhead metro rail (Shahbagh & Dhaka University): runs on a timetable along metro segments.
  metro: {
    deckY: 7.6,           // viaduct height above the road
    deckWidth: 7.2,       // width of the twin-track viaduct
    speed: 28,            // train speed in world units per second
    interval: 16,         // a train starts a pass every this many seconds
    cars: 4,              // carriages per train
    carLength: 9.5,       // length of each carriage
    carGap: 0.6,          // coupling gap between carriages
    soundDist: 65,        // play the metro horn and rumble when passing within this distance
  },

  // Shahbagh student demonstration barricade and traffic jam on the main approach road.
  jam: {
    segId: "shahbag-approach", // main road segment where the demonstration stands
    from: 0.14,                // traffic jam slowdown starts here (fraction of segment)
    to: 0.44,                  // traffic jam ends here
    barricadeAt: 0.324,        // fraction of segment where the student barricade stands
    barricadeMinX: -2.2,       // barricade covers x from -2.2 to the right kerb, leaving the far-left lane open
    barricadeHalfLen: 7.5,     // half-length of the barricade zone along the road
    maxTrafficSpeed: 3.5,      // vehicles inside the jam zone crawl at most this fast
    hornInterval: 2.4,         // seconds between ambient traffic horns in the jam
  },

  // Passenger comfort / patience meter (0..100). Scales the helper's stage tip at checkpoints.
  comfort: {
    max: 100,
    crashDrop: 10,             // comfort lost on each light crash
    hardBrakeThreshold: -18,   // deceleration (accel) below which passengers feel a hard brake
    hardBrakeDrain: 9,         // comfort lost per second during hard braking
    jamSpeedMax: 6,            // below this speed (when not on a stop/mark) passengers lose patience
    jamDrain: 4.5,             // comfort lost per second while crawling in a jam
    recoverMinSpeed: 12,       // above this speed with smooth driving, comfort slowly recovers
    recoverRate: 2.8,          // comfort gained per second during smooth driving
    lowThreshold: 35,          // below this the comfort bar glows and passengers grumble
    grumbleCooldown: 7,        // minimum seconds between passenger grumble lines
    maxStageTip: 50,           // maximum helper tip (৳) awarded at a stage checkpoint when comfort is 100%
  },

  stops: {
    first: 120,           // distance of the first bus stop
    gapMin: 250,          // distance between stops
    gapMax: 400,
    edgeInset: 2,         // stop centre sits this far inside the road edge
    people: 5,            // passengers waiting at each stop
    boardMaxSpeed: 10,    // bus must be slower than this to board passengers
    boardInterval: 0.35,  // seconds between two passengers boarding
    reachX: 2.4,          // how close (sideways) the bus must be to the stop
    reachZ: 8,            // how close (along the road)
    slowWarnCooldown: 1.5,
    despawnBehind: 25,
  },

  // Road marks you must STOP on (be slower than stopSpeed while the bus is over them).
  // Both sit in an outer lane, on a random side.
  marks: {
    edgeInset: 3,         // mark centre sits this far inside the road edge
    width: 3.6,
    length: 14,
    stopSpeed: 6,         // slower than this counts as "stopped on the mark"
    reachX: 2.2,          // how far the bus centre may be from the mark centre (sideways)
    despawnBehind: 25,
  },

  // Yellow CNG-station mark: refuels while you stand on it.
  cng: {
    first: 300,
    gapMin: 450,          // keep this short enough that a careful driver never runs dry
    gapMax: 700,
    refuelRate: 40,       // fuel per second while stopped on the mark
  },

  // Pink police mark: stop here, pay the sergeant, and the chasing crowd goes home.
  police: {
    first: 600,
    gapMin: 600,
    gapMax: 1000,
    payTime: 1,           // seconds you must stand on the mark
    fineBase: 20,         // taka paid...
    finePerPerson: 3,     // ...plus this much for every person in the crowd
  },

  map: {
    forkLat: 1.5,         // at a fork, be this far towards a side to take that branch
    altShare: 0.35,       // share of traffic that takes a side street or flyover
    forkWarn: 140,        // the helper calls the fork this far before it
  },

  nav: {
    arrowAhead: 50,       // the GPS arrow points at the road this far ahead of the bus
    showAhead: 450,       // the next turn or fork appears in the GPS box from this far
    turnCall: 110,        // the helper calls out a turn this far before it
    turnMinDeg: 60,       // gentler bends are not called out
    uTurnDeg: 150,        // a turn this sharp or more is a U-turn
    mapRange: 230,        // world units from the bus to the edge of the minimap
    mapBusY: 0.64,        // the bus sits this far down the minimap, so more road ahead shows
    mapHz: 15,            // minimap redraws per second (it does not need all 60)
    mapRoadScale: 1.6,    // roads are drawn wider than real so they read at this small size
    routeStep: 8,         // spacing of the points on the yellow route line
    routeWidth: 7,        // width of the yellow route line, in world units
    markPx: 5.5,          // size of the stop / CNG / police / public icons on the minimap (CSS pixels)
  },

  world: {
    roadHalfWidth: 7,
    skyColor: 0xcfe3ee,
    fogNear: 50,
    fogFar: 170,
    dash: [3, 10],        // lane markings: 3 units of paint every 10 units
    stubWidth: 12,        // side roads at junctions (just scenery)
    stubLength: 70,
    buildingGap: 11,      // distance between buildings along the road
    buildingPool: 160,    // how many building groups exist (they are reused)
    buildingAhead: 260,   // buildings are placed this far ahead of the bus...
    buildingBehind: 50,   // ...and kept until this far behind
    buildingColors: [0xd7ccc8, 0xffe0b2, 0xb0bec5, 0xc5e1a5, 0xf8bbd0, 0xbcaaa4],
  },

  camera: {
    fov: 70,              // starting field of view
    baseFov: 68,          // field of view at speed 0...
    fovPerSpeed: 0.35,    // ...widened by this much per unit of speed
    fovSmoothing: 3,      // how quickly the view widens / narrows
    followX: 0.6,         // how much the camera follows the bus sideways (0..1)
    followSmoothing: 5,   // lower = camera lags more behind sideways moves
    followYaw: 0.5,       // how much the camera turns with the bus (1) or the road (0)
    yawSmoothing: 4,      // lower = camera swings round bends more lazily
    roadMargin: 1.5,      // the camera never goes further than this outside the road edge
    height: 6.2,
    distance: 13,
    lookY: 1.5,
    lookAhead: 14,        // the camera looks at a point this far ahead of the bus
    shakeDecay: 1.5,      // how fast shake fades
    shakeScale: 1,        // set to 0 to turn camera shake off
    boostFovKick: 9,      // extra field of view while boosting
    boostPullBack: 1.2,   // camera drops back a little while boosting
    boostFxSmoothing: 4,  // how fast the boost effect fades in and out
    speedLinesOpacity: 0.5, // set to 0 to hide the boost speed lines
    introSeconds: 1.8,    // skippable morning pan at Mohammadpur Bus Stand on a fresh run
    far: 300,
  },

  input: {
    stickDeadzone: 0.15,  // gamepad stick movement smaller than this is ignored
  },

  loop: {
    hz: 60,               // simulation steps per second (fixed timestep)
    maxFrameDt: 0.25,     // after a long freeze, simulate at most this much time
  },

  render: {
    maxPixelRatio: 2,     // lower to 1 for more speed on phones
  },

  hud: {
    kmhPerSpeed: 2.2,     // converts speed to the km/h number shown
    unitsPerKm: 100,      // converts distance to the km number shown
    lowFuel: 25,          // below this the fuel box blinks gently
  },
};
