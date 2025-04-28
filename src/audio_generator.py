from pyo import *

def generate_audio(left_energy, right_energy, duration=1000):
    s = Server().boot()
    s.start()
    
    # Normalize energies to amplitude (0 to 1)
    left_amp = min(abs(left_energy) / 100, 1.0)
    right_amp = min(abs(right_energy) / 100, 1.0)
    
    # White noise baseline + sine wave for object
    noise = Noise(mul=0.02).out()  # -34 dB baseline
    sine_left = Sine(freq=300, mul=left_amp).out(0)  # Left channel
    sine_right = Sine(freq=300, mul=right_amp).out(1)  # Right channel
    
    s.gui(locals())  # Keep server alive for duration ms
    # Note: For non-GUI, use time.sleep(duration/1000) and s.stop()

if __name__ == "__main__":
    generate_audio(50, 20, 2000)  # Test with dummy values