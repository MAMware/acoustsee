function HRTFPanner(audioContext, sourceNode, hrtfContainer) {
    let azimuthOffset = 0;
    const loPass = audioContext.createBiquadFilter();
    const hiPass = audioContext.createBiquadFilter();
    loPass.type = "lowpass";
    loPass.frequency.value = 200;
    hiPass.type = "highpass";
    hiPass.frequency.value = 200;
    // Use PannerNode with HRTF for now
    const panner = audioContext.createPanner();
    panner.panningModel = 'HRTF';
    panner.distanceModel = 'linear';
    panner.refDistance = 1;
    panner.maxDistance = 10000;
    panner.rolloffFactor = 1;
    sourceNode.channelCount = 1;
    sourceNode.connect(loPass);
    sourceNode.connect(hiPass);
    hiPass.connect(panner);
    this.update = function(azimuth, elevation) {
        const adjustedAzimuth = azimuth + azimuthOffset;
        const radAz = (adjustedAzimuth * Math.PI) / 180;
        const radEl = (elevation * Math.PI) / 180;
        const distance = 1;
        const x = distance * Math.cos(radEl) * Math.sin(radAz);
        const y = distance * Math.sin(radEl);
        const z = distance * Math.cos(radEl) * Math.cos(radAz);
        panner.positionX.setValueAtTime(x, audioContext.currentTime);
        panner.positionY.setValueAtTime(y, audioContext.currentTime);
        panner.positionZ.setValueAtTime(z, audioContext.currentTime);
    };
    this.setCalibrationOffset = function(offset) {
        azimuthOffset = offset;
    };
    this.connect = function(destination) {
        loPass.connect(destination);
        panner.connect(destination);
    };
    this.setSource = function(newSource) {
        sourceNode.disconnect(loPass);
        sourceNode.disconnect(hiPass);
        newSource.connect(loPass);
        newSource.connect(hiPass);
        sourceNode = newSource;
    };
}
