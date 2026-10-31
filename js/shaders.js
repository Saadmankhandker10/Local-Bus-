// Advanced Three.js material & shader techniques:
// 1. Loadshedding shader (uBlackout, onBeforeCompile)
// 2. Procedural LED bulb shader (per-bulb asynchronous strobe & wave)
// 3. Additive blending materials (boost flames, headlight beams, collision sparks)
// 4. Vertex colors for single-draw-call multi-color meshes
// 5. PolygonOffset depth biasing against z-fighting
// 6. Comprehensive GPU memory disposal (disposeHierarchy)
import * as THREE from "three";

/* ====== 1. Loadshedding / Blackout Shader (uBlackout, onBeforeCompile) ====== */

export const blackoutState = {
  active: false,
  timer: 0,
  uniform: { value: 0.0 }, // 0.0 = full electric power, 1.0 = pitch dark blackout
};

/**
 * Injects uBlackout uniform into MeshLambertMaterial, MeshStandardMaterial or MeshBasicMaterial.
 * When uBlackout > 0 (loadshedding/brownout), emissive window lights and shop hoardings dim down.
 */
export function attachBlackoutShader(material) {
  const prevCompile = material.onBeforeCompile;
  material.onBeforeCompile = (shader, renderer) => {
    if (prevCompile) prevCompile(shader, renderer);

    shader.uniforms.uBlackout = blackoutState.uniform;

    if (!shader.fragmentShader.includes("uniform float uBlackout;")) {
      shader.fragmentShader = shader.fragmentShader.replace(
        "#include <common>",
        `#include <common>
         uniform float uBlackout;`
      );
    }

    // Suppress emissive radiance proportionally to uBlackout (down to 5% emergency backup)
    if (shader.fragmentShader.includes("#include <emissivemap_fragment>")) {
      if (!shader.fragmentShader.includes("totalEmissiveRadiance *= mix")) {
        shader.fragmentShader = shader.fragmentShader.replace(
          "#include <emissivemap_fragment>",
          `#include <emissivemap_fragment>
           totalEmissiveRadiance *= mix(1.0, 0.05, uBlackout);`
        );
      }
    }
  };
  material.needsUpdate = true;
  return material;
}

/** Trigger an authentic Dhaka loadshedding power outage for a given duration in seconds. */
export function triggerLoadshedding(duration = 6.0) {
  blackoutState.active = true;
  blackoutState.timer = Math.max(blackoutState.timer, duration);
}

/** Updates blackout timer and simulates realistic brownout flickering. */
export function updateLoadshedding(dt) {
  if (blackoutState.timer > 0) {
    blackoutState.timer -= dt;
    // Brownout flicker at start and end
    if (blackoutState.timer > 0.6) {
      blackoutState.uniform.value = Math.min(1.0, blackoutState.uniform.value + dt * 4.5);
    } else {
      const flicker = (Math.random() < 0.25) ? 0.3 : 1.0;
      blackoutState.uniform.value = Math.max(0.0, blackoutState.uniform.value - dt * 2.2 * flicker);
    }
    if (blackoutState.timer <= 0) {
      blackoutState.active = false;
      blackoutState.uniform.value = 0.0;
    }
  } else {
    blackoutState.uniform.value = 0.0;
  }
}

/* ====== 2. Procedural LED Bulb Shader ====== */

export const ledTimeUniform = { value: 0.0 };

/**
 * Creates an asynchronous flashing / wave-chasing LED material using vertex colors and bulb attribute.
 * Every individual bulb has an index float `bulb`. The GPU shader runs individual sine strobes.
 */
export function createLEDMaterial(options = {}) {
  const speed = options.speed || 8.0;
  const gain = options.gain || 2.2;
  const isPolice = !!options.police;

  const mat = new THREE.MeshBasicMaterial({
    vertexColors: true,
    toneMapped: false,
  });

  mat.userData = { isLED: true, isShared: true };

  mat.onBeforeCompile = (shader) => {
    shader.uniforms.uLedT = ledTimeUniform;
    shader.uniforms.uLedSpeed = { value: speed };
    shader.uniforms.uLedGain = { value: gain };

    shader.vertexShader = shader.vertexShader
      .replace(
        "#include <common>",
        `#include <common>
         attribute float bulb;
         varying float vBulb;`
      )
      .replace(
        "#include <color_vertex>",
        `#include <color_vertex>
         vBulb = bulb;`
      );

    shader.fragmentShader = shader.fragmentShader.replace(
      "#include <common>",
      `#include <common>
       uniform float uLedT;
       uniform float uLedSpeed;
       uniform float uLedGain;
       varying float vBulb;`
    );

    if (isPolice) {
      // Police strobe: bulbs 0..3 strobe Red 3 times, bulbs 4..7 strobe Blue 3 times
      shader.fragmentShader = shader.fragmentShader.replace(
        "#include <color_fragment>",
        `#include <color_fragment>
         float cycle = mod(uLedT * uLedSpeed, 2.0);
         float isRedSide = step(vBulb, 3.5);
         float activeSide = (cycle < 1.0) ? isRedSide : (1.0 - isRedSide);
         float flash = step(0.5, sin(cycle * 37.699)) * activeSide;
         diffuseColor.rgb *= (flash * uLedGain + 0.15);`
      );
    } else {
      // Chasing fairy lights / decorative garland wave
      shader.fragmentShader = shader.fragmentShader.replace(
        "#include <color_fragment>",
        `#include <color_fragment>
         float wave = sin(uLedT * uLedSpeed + vBulb * 1.25);
         float isOn = step(-0.2, wave);
         float glow = smoothstep(-0.2, 1.0, wave);
         diffuseColor.rgb *= (isOn * 0.75 + glow * uLedGain + 0.12);`
      );
    }
  };

  return mat;
}

/** Helper to generate an array of LED bulb boxes with individual `bulb` attributes and vertex colors. */
export function createLEDRowGeometry(count, length, size, colorPalette) {
  const g = new THREE.BufferGeometry();
  const pos = [], cols = [], bulbs = [], idx = [];
  const halfS = size / 2;
  const stepX = count > 1 ? length / (count - 1) : 0;
  const startX = -length / 2;

  for (let i = 0; i < count; i++) {
    const cx = startX + i * stepX;
    const hex = colorPalette[i % colorPalette.length];
    const c = new THREE.Color(hex);
    const base = pos.length / 3;

    // Unit cube corners around (cx, 0, 0)
    const corners = [
      [-halfS, -halfS, -halfS], [halfS, -halfS, -halfS],
      [halfS, halfS, -halfS], [-halfS, halfS, -halfS],
      [-halfS, -halfS, halfS], [halfS, -halfS, halfS],
      [halfS, halfS, halfS], [-halfS, halfS, halfS],
    ];

    for (const [dx, dy, dz] of corners) {
      pos.push(cx + dx, dy, dz);
      cols.push(c.r, c.g, c.b);
      bulbs.push(i);
    }

    // 6 faces (12 triangles)
    const f = [
      0, 2, 1, 0, 3, 2, // front
      4, 5, 6, 4, 6, 7, // back
      0, 1, 5, 0, 5, 4, // bottom
      3, 6, 2, 3, 7, 6, // top
      0, 4, 7, 0, 7, 3, // left
      1, 2, 6, 1, 6, 5  // right
    ];
    for (const vi of f) idx.push(base + vi);
  }

  g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute("color", new THREE.Float32BufferAttribute(cols, 3));
  g.setAttribute("bulb", new THREE.Float32BufferAttribute(bulbs, 1));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

/* ====== 3. Additive Blending Materials (Sparks, Nitro Flames, Headlight Beams) ====== */

/** Shared additive materials library for high-energy glows and particle effects. */
export const boostFlameMat = new THREE.MeshBasicMaterial({
  color: 0x00e5ff,
  transparent: true,
  opacity: 0.85,
  blending: THREE.AdditiveBlending,
  depthWrite: false,
});
boostFlameMat.userData = { isShared: true };

export const boostCoreMat = new THREE.MeshBasicMaterial({
  color: 0xff6d00,
  transparent: true,
  opacity: 0.95,
  blending: THREE.AdditiveBlending,
  depthWrite: false,
});
boostCoreMat.userData = { isShared: true };

export const sparkMat = new THREE.MeshBasicMaterial({
  color: 0xffea00,
  transparent: true,
  opacity: 0.9,
  blending: THREE.AdditiveBlending,
  depthWrite: false,
});
sparkMat.userData = { isShared: true };

export const headlightBeamMat = new THREE.MeshBasicMaterial({
  color: 0xfffaed,
  transparent: true,
  opacity: 0.18,
  blending: THREE.AdditiveBlending,
  depthWrite: false,
  side: THREE.DoubleSide,
});
headlightBeamMat.userData = { isShared: true };

export const glowHaloMat = new THREE.MeshBasicMaterial({
  color: 0xffd54f,
  transparent: true,
  opacity: 0.6,
  blending: THREE.AdditiveBlending,
  depthWrite: false,
});
glowHaloMat.userData = { isShared: true };

/** Procedural volumetric conical headlight beam geometry. */
export function createHeadlightBeamGeo(length = 26, radiusTop = 0.22, radiusBottom = 3.2) {
  const geo = new THREE.CylinderGeometry(radiusBottom, radiusTop, length, 12, 1, true);
  // Re-orient cylinder along -Z axis with apex at (0, 0, 0)
  geo.rotateX(-Math.PI / 2);
  geo.translate(0, 0, -length / 2);
  return geo;
}

/* ====== 4. PolygonOffset Helpers (Z-Fighting & Shimmer Prevention) ====== */

/**
 * Configure standard polygonOffset depth biasing on any material placed on road/ground.
 * factor = -1.0 to -2.0 pulls fragments towards camera in depth buffer without altering geometry.
 */
export function applyPolygonOffset(material, factor = -1.0, units = -2.0) {
  material.polygonOffset = true;
  material.polygonOffsetFactor = factor;
  material.polygonOffsetUnits = units;
  return material;
}

/* ====== 5. Shaders & Material Tick (Call once per frame) ====== */

export function updateShaders(dt) {
  ledTimeUniform.value += dt;
  updateLoadshedding(dt);
}

/* ====== 6. Comprehensive GPU Memory Disposal (disposeHierarchy) ====== */

/**
 * Recursively disposes all geometries, materials, and textures under an Object3D / Group.
 * Avoids leaking GPU VRAM on restarts, despawns, and long gameplay sessions.
 * Skips assets marked with `userData.isShared = true`.
 */
export function disposeHierarchy(root) {
  if (!root) return;

  root.traverse((node) => {
    if (node.geometry && !node.geometry.userData?.isShared) {
      node.geometry.dispose();
    }

    if (node.material) {
      const mats = Array.isArray(node.material) ? node.material : [node.material];
      for (const m of mats) {
        if (!m || m.userData?.isShared) continue;

        if (m.map && !m.map.userData?.isShared) m.map.dispose();
        if (m.emissiveMap && !m.emissiveMap.userData?.isShared) m.emissiveMap.dispose();
        if (m.alphaMap && !m.alphaMap.userData?.isShared) m.alphaMap.dispose();
        if (m.normalMap && !m.normalMap.userData?.isShared) m.normalMap.dispose();

        m.dispose();
      }
    }
  });
}

