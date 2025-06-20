// Placeholder: Will load CIPIC HRIR data later
function HRTFContainer() {
    this.loadHrir = function(file, onLoad) {
        console.log('HRIR loading not implemented yet');
        onLoad();
    };
// Return dummy HRIR for now
    this.interpolateHRIR = function(azimuth, elevation) {
        return [new Float32Array(200), new Float32Array(200)];
    };
}
