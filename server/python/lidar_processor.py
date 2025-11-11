import cv2
import numpy as np
from pathlib import Path
import argparse

def process_map(input_path, output_dir=None, debug=False):
    # CONSTANTS
    median_kernel = 3
    morph_kernel = 5
    MAX_GAP_SIZE = 20
    RESOLUTION_CM_PER_PIXEL = 5
    
    # 
    input_path = Path(input_path)
    if output_dir is None:
        output_dir = input_path.parent
    else:
        output_dir = Path(output_dir)
    output_dir.mkdir(parents=True, exist_ok=True)
    stem = input_path.stem

    # STEP 1. LOAD IMAGE
    img = cv2.imread(str(input_path), cv2.IMREAD_UNCHANGED)
    if img is None:
        raise FileNotFoundError(f"Image not found: {input_path}")
    if debug:
        print(f"Loaded image with shape: {img.shape}")

    # STEP 2. REMOVE NOISE + BLUR IMAGE
    img_blur = cv2.medianBlur(img, median_kernel)

    # STEP 3. THRESHOLDING TO CREATE BINARY MAP
    _, binary = cv2.threshold(img_blur, 1, 255, cv2.THRESH_BINARY_INV)

    kernel = np.ones((median_kernel, morph_kernel), np.uint8)
    # binary_clean = cv2.morphologyEx(binary, cv2.MORPH_OPEN, kernel, iterations=1)
    binary_clean = cv2.morphologyEx(binary, cv2.MORPH_CLOSE, kernel, iterations=1)  

    # STEP 4. FILL GAPS
    MAX_GAP_PIXELS = int(MAX_GAP_SIZE / RESOLUTION_CM_PER_PIXEL)
    inverted = cv2.bitwise_not(binary_clean)
    num_labels, labels, stats, centroids = cv2.connectedComponentsWithStats(
            inverted, connectivity=8
        )
    result = inverted.copy()
    
    for kernel_size in range(3, MAX_GAP_PIXELS * 2 + 1, 2):
        kernel = np.ones((kernel_size, morph_kernel), np.uint8)
        dilated = cv2.dilate(inverted, kernel, iterations=1)

        filled_gaps = cv2.bitwise_and(dilated, cv2.bitwise_not(inverted))

        num_gaps, gap_labels, gap_stats, _ = cv2.connectedComponentsWithStats(
                    filled_gaps, connectivity=8
                )

        for i in range(1, num_gaps):  # Skip background (0)
                    gap_width = gap_stats[i, cv2.CC_STAT_WIDTH]
                    gap_height = gap_stats[i, cv2.CC_STAT_HEIGHT]
                    gap_area = gap_stats[i, cv2.CC_STAT_AREA]
                    
                    # Check if gap is smaller than threshold
                    max_dimension = max(gap_width, gap_height)
                    
                    if max_dimension <= MAX_GAP_PIXELS and gap_area <= (MAX_GAP_PIXELS ** 2):
                        # Fill this small gap
                        gap_mask = (gap_labels == i).astype(np.uint8) * 255
                        result = cv2.bitwise_or(result, gap_mask)

        if kernel_size >= MAX_GAP_PIXELS * 2:
                break
    
    IMAGE_clean = cv2.bitwise_not(result)

    return IMAGE_clean

def canny(img, debug=False):
    # Ensure image is grayscale
    if len(img.shape) == 3:
        gray = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY)
    else:
        gray = img
    
    # Edge detection parameters - adjusted for better detection
    blur_kernel = 5
    threshold1 = 30
    threshold2 = 100

    # Apply Gaussian blur first for better edge detection
    blurred = cv2.GaussianBlur(gray, (blur_kernel, blur_kernel), 0)
    
    # Detect edges
    edges = cv2.Canny(blurred, threshold1, threshold2)

    # Hough Line parameters - more lenient to detect more lines
    rho = 1
    theta = np.pi / 180
    threshold = 50  # Lowered from 100
    min_line_length = 30  # Increased from 10
    max_line_gap = 20  # Increased from 10

    # Detect lines
    lines = cv2.HoughLinesP(edges, rho, theta, threshold, 
                           minLineLength=min_line_length, 
                           maxLineGap=max_line_gap)

    # Create output image (BGR for colored lines)
    result = cv2.cvtColor(edges, cv2.COLOR_GRAY2BGR)
    
    # Draw detected lines on the result
    if lines is not None:
        if debug:
            print(f"Detected {len(lines)} lines")
        for line in lines:
            x1, y1, x2, y2 = line[0]
            cv2.line(result, (x1, y1), (x2, y2), (0, 255, 0), 2)  # Green lines
    else:
        if debug:
            print("No lines detected")
    
    return result

if __name__ == "__main__":
     
    parser = argparse.ArgumentParser(description="Process LIDAR map to remove noise and fill gaps.")
    parser.add_argument("input_path", type=str, help="Path to the input LIDAR map image.")
    parser.add_argument("--output_dir", type=str, default=None, help="Directory to save the processed image.")
    parser.add_argument("--debug", action="store_true", help="Enable debug mode for verbose output.")
    
    args = parser.parse_args()
    
    processed_image = process_map(args.input_path, args.output_dir, args.debug)

    processed_image_2 = canny(processed_image)
    
    output_path = Path(args.output_dir if args.output_dir else Path(args.input_path).parent) / f"{Path(args.input_path).stem}_processed.png"
    cv2.imwrite(str(output_path), processed_image)

    output_path_edges = Path(args.output_dir if args.output_dir else Path(args.input_path).parent) / f"{Path(args.input_path).stem}_edges.png"
    cv2.imwrite(str(output_path_edges), processed_image_2)
    
    if args.debug:
        print(f"Processed image saved to: {output_path}")
        print(f"Edges image saved to: {output_path_edges}")