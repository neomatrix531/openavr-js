import * as THREE from 'three';

class OpenAVR {
  constructor(options = {}) {
    this.mode = options.mode || 'AR';
    this.renderer = options.renderer || null;
    this.onGesture = options.onGesture || (() => {});
    this.onVoiceCommand = options.onVoiceCommand || (() => {});
    this.witToken = options.witToken || null;

    this.xrSession = null;
    this.xrReferenceSpace = null;
    this.gl = null;

    this.canvas = document.createElement('canvas');
    document.body.appendChild(this.canvas);

    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera();
    this.renderer3D = new THREE.WebGLRenderer({ canvas: this.canvas });
    this.raycaster = new THREE.Raycaster();

    this.guiContainer = this.createHTMLGUI();
    this.initVoiceInput();
    this.create3DGUI();
  }

  async initXR() {
    if (!navigator.xr) throw new Error("WebXR not supported");

    const sessionType = this.mode === 'VR' ? 'immersive-vr' : 'immersive-ar';
    const isSupported = await navigator.xr.isSessionSupported(sessionType);
    if (!isSupported) throw new Error(`${this.mode} not supported`);

    this.xrSession = await navigator.xr.requestSession(sessionType, {
      optionalFeatures: ['local-floor', 'hand-tracking']
    });

    this.gl = this.canvas.getContext('webgl', { xrCompatible: true });
    this.xrSession.updateRenderState({ baseLayer: new XRWebGLLayer(this.xrSession, this.gl) });

    this.xrReferenceSpace = await this.xrSession.requestReferenceSpace('local-floor');
    this.xrSession.requestAnimationFrame(this.onXRFrame.bind(this));
  }

  onXRFrame(time, frame) {
    const session = frame.session;
    const pose = frame.getViewerPose(this.xrReferenceSpace);

    this.renderer3D.setSize(window.innerWidth, window.innerHeight);
    this.renderer3D.setAnimationLoop(() => {
      this.renderer3D.render(this.scene, this.camera);
    });

    if (pose) {
      this.updateCameraFromPose(pose);
      this.detectGaze(pose);
    }

    for (const inputSource of session.inputSources) {
      if (inputSource.hand) {
        this.detectGestures(inputSource.hand, frame);
      }
      if (inputSource.gamepad) {
        this.detectControllerInput(inputSource);
      }
    }

    session.requestAnimationFrame(this.onXRFrame.bind(this));
  }

  updateCameraFromPose(pose) {
    const view = pose.views[0];
    const pos = view.transform.position;
    const ori = view.transform.orientation;

    this.camera.position.set(pos.x, pos.y, pos.z);
    this.camera.quaternion.set(ori.x, ori.y, ori.z, ori.w);
  }

  detectGestures(hand, frame) {
    const indexTip = hand.get('index-finger-tip');
    const thumbTip = hand.get('thumb-tip');

    const indexPose = frame.getJointPose(indexTip, this.xrReferenceSpace);
    const thumbPose = frame.getJointPose(thumbTip, this.xrReferenceSpace);

    if (indexPose && thumbPose) {
      const dx = indexPose.transform.position.x - thumbPose.transform.position.x;
      const dy = indexPose.transform.position.y - thumbPose.transform.position.y;
      const dz = indexPose.transform.position.z - thumbPose.transform.position.z;
      const distance = Math.sqrt(dx * dx + dy * dy + dz * dz);

      if (distance < 0.02) {
        this.onGesture('pinch');
        this.guiContainer.querySelector('#actionBtn').click();
      }
    }
  }

  detectGaze(pose) {
    const orientation = pose.views[0].transform.orientation;
    const quaternion = new THREE.Quaternion(orientation.x, orientation.y, orientation.z, orientation.w);
    const gazeDirection = new THREE.Vector3(0, 0, -1).applyQuaternion(quaternion);

    this.raycaster.set(this.camera.position, gazeDirection);
    const intersects = this.raycaster.intersectObjects(this.scene.children);
    if (intersects.length > 0) {
      intersects[0].object.material.color.set(0xff0000);
    }
  }

  detectControllerInput(inputSource) {
    if (inputSource.gamepad.buttons[0].pressed) {
      this.onGesture('select');
    }
  }

  initVoiceInput() {
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognition || !this.witToken) return;

    const recognition = new SpeechRecognition();
    recognition.continuous = true;
    recognition.lang = 'en-US';

    recognition.onresult = async (event) => {
      const transcript = event.results[event.results.length - 1][0].transcript.trim();
      const response = await fetch(`https://api.wit.ai/message?v=20230801&q=${encodeURIComponent(transcript)}`, {
        headers: { Authorization: `Bearer ${this.witToken}` }
      });
      const data = await response.json();
      this.onVoiceCommand(data.entities);
    };

    recognition.start();
  }

  createHTMLGUI() {
    const container = document.createElement('div');
    container.id = 'openavr-gui';
    container.style.position = 'absolute';
    container.style.top = '10px';
    container.style.left = '10px';
    container.style.zIndex = '999';
    container.innerHTML = `
      <h3>OpenAVR Controls</h3>
      <button id="actionBtn">Do Something</button>
      <input type="range" min="0" max="100" value="50" id="slider">
    `;
    document.body.appendChild(container);
    return container;
  }

  create3DGUI() {
    const geometry = new THREE.BoxGeometry(0.2, 0.1, 0.02);
    const material = new THREE.MeshBasicMaterial({ color: 0x00ff00 });
    const buttonMesh = new THREE.Mesh(geometry, material);
    buttonMesh.position.set(0, 1.5, -2);
    this.scene.add(buttonMesh);
  }
  }
