// Placeholder: Will load CIPIC HRIR data later
function HRTFContainer() {
    this.loadHrir = function(file, onLoad) {
        console.log('HRIR loading not implemented yet');
        onLoad();
    };

    this.interpolateHRIR = function(azimuth, elevation) {
        // Return dummy HRIR for now
        return [new Float32Array(200), new Float32Array(200)];
    };
}
