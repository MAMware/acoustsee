from video_processor import process_image
from audio_generator import generate_audio

def main():
    left_energy, right_energy = process_image("examples/wall_left.jpg")
    generate_audio(left_energy, right_energy, 2000)

if __name__ == "__main__":
    main()