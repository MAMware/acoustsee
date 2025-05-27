from pyo import *

def generate_audio(left_energy, right_energy, duration=1000, output_file="examples/output.wav"):
    s = Server(audio="offline").boot()
    s.recordOptions(dur=duration/1000, filename=output_file)
    
    # Normalize energies to amplitude (0 to 1)
    left_amp = min(abs(left_energy) / 100, 1.0)
    right_amp = min(abs(right_energy) / 100, 1.0)
    
    # White noise baseline + sine wave for object
    noise = Noise(mul=0.02).out()  # -34 dB baseline
    sine_left = Sine(freq=300, mul=left_amp).out(0)  # Left channel
    sine_right = Sine(freq=300, mul=right_amp).out(1)  # Right channel
    
    s.start()
    s.stop()

if __name__ == "__main__":
    generate_audio(50, 20, 2000, "examples/test_output.wav")