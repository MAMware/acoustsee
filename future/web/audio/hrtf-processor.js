// hrtf-processor.js
// Provides HRTF spatialization for Web Audio API nodes

export function applyHRTF(context, sourceNode, position = {x:0, y:0, z:0}) {
    if (!context || !sourceNode) return null;
    const panner = context.createPanner();
    panner.panningModel = 'HRTF';
    panner.setPosition(position.x, position.y, position.z);
    sourceNode.connect(panner).connect(context.destination);
    return panner;
}

// Optionally, add more advanced HRTF features here
