/**
 * Lazy three.js viewer for a rendered STL.
 *
 * Everything here is imported on first use so the project page does not ship
 * three.js to visitors who never open the viewer. The caller owns the canvas
 * and must call `dispose()` when the dialog closes.
 */

export interface StlViewerOptions {
  /** Called after the model is loaded and the first frame is drawn. */
  onReady?: () => void;
  /** Colours resolved from the page theme, so the model does not glare in dark mode. */
  background?: string | null;
}

export interface StlViewer {
  reset(): void;
  dispose(): void;
}

/**
 * Distance at which a box of the given half-extents, seen edge-on, fills a
 * camera with a vertical `fovDegrees`. Framing the box instead of its bounding
 * sphere keeps flat parts (plates, brackets) large on screen.
 */
export function fitDistance(
  halfWidth: number,
  halfHeight: number,
  fovDegrees: number,
  aspect: number,
  padding = 1.08,
): number {
  if (!(halfWidth >= 0) || !(halfHeight >= 0) || halfWidth + halfHeight <= 0) {
    throw new Error('the model has no size');
  }
  if (!(fovDegrees > 0) || fovDegrees >= 180) throw new Error('fov must be between 0 and 180');
  if (!(aspect > 0)) throw new Error('aspect must be positive');
  const tanVertical = Math.tan((fovDegrees * Math.PI) / 360);
  const tanHorizontal = tanVertical * aspect;
  return Math.max(halfHeight / tanVertical, halfWidth / tanHorizontal) * padding;
}

export async function mountStlViewer(
  canvas: HTMLCanvasElement,
  url: string,
  options: StlViewerOptions = {},
): Promise<StlViewer> {
  const [THREE, { OrbitControls }, { STLLoader }] = await Promise.all([
    import('three'),
    import('three/addons/controls/OrbitControls.js'),
    import('three/addons/loaders/STLLoader.js'),
  ]);

  const renderer = new THREE.WebGLRenderer({
    canvas,
    antialias: true,
    alpha: true,
    powerPreference: 'high-performance',
  });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.setSize(canvas.clientWidth || 640, canvas.clientHeight || 480, false);

  const scene = new THREE.Scene();
  const background = options.background ?? null;
  if (background) scene.background = new THREE.Color(background);

  const camera = new THREE.PerspectiveCamera(42, 1, 0.1, 5000);
  camera.position.set(0, 0, 1);

  const hemisphere = new THREE.HemisphereLight(0xffffff, 0x404652, 2.1);
  scene.add(hemisphere);

  const key = new THREE.DirectionalLight(0xffffff, 2.4);
  key.position.set(1, 1.4, 1.1);
  scene.add(key);

  const fill = new THREE.DirectionalLight(0xdfe8ff, 0.9);
  fill.position.set(-1.2, -0.4, -0.8);
  scene.add(fill);

  const controls = new OrbitControls(camera, canvas);
  controls.enableDamping = true;
  controls.dampingFactor = 0.08;
  controls.rotateSpeed = 0.9;
  controls.zoomSpeed = 0.85;
  controls.panSpeed = 0.8;
  controls.screenSpacePanning = true;
  controls.minPolarAngle = 0;
  controls.maxPolarAngle = Math.PI;
  controls.touches = { ONE: THREE.TOUCH.ROTATE, TWO: THREE.TOUCH.DOLLY_PAN };

  const geometry = await new STLLoader().loadAsync(url);
  // SolidCraft exports Z-up geometry; three.js treats Y as up.
  geometry.rotateX(-Math.PI / 2);
  geometry.computeBoundingBox();
  const box = geometry.boundingBox ?? new THREE.Box3();
  const size = box.getSize(new THREE.Vector3());
  const center = box.getCenter(new THREE.Vector3());

  // Centre the model so orbiting happens around its middle, not the origin.
  geometry.translate(-center.x, -center.y, -center.z);

  const material = new THREE.MeshStandardMaterial({
    color: 0x9aa3ad,
    metalness: 0.15,
    roughness: 0.55,
    flatShading: false,
  });
  const mesh = new THREE.Mesh(geometry, material);
  scene.add(mesh);

  const radius = Math.max(size.length() / 2, 0.001);
  // Classic isometric: 45° azimuth, ~35° elevation, matching the iso snapshot.
  const viewDirection = new THREE.Vector3(1, 1, 1).normalize();
  const fit = () => {
    const width = canvas.clientWidth || 640;
    const height = canvas.clientHeight || 480;
    const aspect = width > 0 && height > 0 ? width / height : 1;
    // Project the box onto the camera's right and up axes so the framing
    // matches what the viewer actually sees.
    const right = new THREE.Vector3().crossVectors(new THREE.Vector3(0, 1, 0), viewDirection).normalize();
    const up = new THREE.Vector3().crossVectors(viewDirection, right).normalize();
    const halfWidth = 0.5 * (size.x * Math.abs(right.x) + size.y * Math.abs(right.y) + size.z * Math.abs(right.z));
    const halfHeight = 0.5 * (size.x * Math.abs(up.x) + size.y * Math.abs(up.y) + size.z * Math.abs(up.z));
    const distance = fitDistance(halfWidth, halfHeight, camera.fov, aspect, 1.32);

    camera.position.copy(viewDirection).multiplyScalar(distance);
    camera.near = Math.max(distance / 100, 0.01);
    camera.far = distance * 100;
    camera.updateProjectionMatrix();
    controls.target.set(0, 0, 0);
    controls.minDistance = Math.max(radius * 0.08, distance * 0.02);
    controls.maxDistance = distance * 10;
    controls.update();
  };
  fit();

  const resize = () => {
    const width = canvas.clientWidth || 640;
    const height = canvas.clientHeight || 480;
    if (width === 0 || height === 0) return;
    renderer.setSize(width, height, false);
    camera.aspect = width / height;
    camera.updateProjectionMatrix();
  };
  resize();

  const observer = new ResizeObserver(resize);
  observer.observe(canvas);

  let frame = 0;
  let disposed = false;
  const loop = () => {
    if (disposed) return;
    frame = requestAnimationFrame(loop);
    controls.update();
    renderer.render(scene, camera);
  };
  loop();
  options.onReady?.();

  return {
    reset() {
      fit();
      resize();
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      cancelAnimationFrame(frame);
      observer.disconnect();
      controls.dispose();
      geometry.dispose();
      material.dispose();
      renderer.dispose();
      scene.clear();
    },
  };
}
