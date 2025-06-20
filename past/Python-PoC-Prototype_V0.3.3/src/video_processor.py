import cv2
import numpy as np
from scipy import signal

def gabor_kernel(size, theta, sigma, frequency):
    x, y = np.meshgrid(np.arange(-size//2, size//2+1), np.arange(-size//2, size//2+1))
    x_rot = x * np.cos(theta) + y * np.sin(theta)
    y_rot = -x * np.sin(theta) + y * np.cos(theta)
    return np.exp(-(x_rot**2 + y_rot**2)/(2*sigma**2)) * np.cos(2*np.pi*frequency*x_rot)

def process_image(image_path):
    # Load and preprocess image
    img = cv2.imread(image_path, cv2.IMREAD_GRAYSCALE)
    img = cv2.resize(img, (320, 240))  # Smaller for speed
    
    # Gabor filter bank
    kernels = [gabor_kernel(31, theta, 5, 0.1) for theta in [0, np.pi/4, np.pi/2, 3*np.pi/4]]
    coeffs = [signal.convolve2d(img, k, mode='same') for k in kernels]
    
    # Simple left/right split
    left_half = np.mean([c[:, :160] for c in coeffs], axis=(0, 1, 2))
    right_half = np.mean([c[:, 160:] for c in coeffs], axis=(0, 1, 2))
    return left_half, right_half

if __name__ == "__main__":
    left, right = process_image("examples/wall_left.jpg")
    print(f"Left energy: {left:.2f}, Right energy: {right:.2f}")