const avr = new OpenAVR({
  mode: 'AR',
  witToken: 'YOUR_WIT_AI_TOKEN',
  renderer: (gl, pose) => {
    console.log("Rendering AR scene...");
  },
  onGesture: (type) => {
    if (type === 'pinch') console.log("Pinch gesture detected");
    if (type === 'select') console.log("Controller select detected");
  },
  onVoiceCommand: (entities) => {
    if (entities.intent?.[0]?.value === 'change_scene') {
      console.log("Voice intent: Change scene");
    }
  }
});

avr.initXR().catch(console.error);
