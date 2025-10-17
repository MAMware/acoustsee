/**
 * Optional Semantic Feature Detector
 * 
 * This module provides optional, heuristic-based semantic object detection
 * for educational and open-source community development.
 * 
 * Design Philosophy:
 * - OPTIONAL: Can be enabled/disabled via configuration
 * - HEURISTIC: Uses threshold-based detection (no ML models)
 * - EDUCATIONAL: Community can enhance with new object types
 * - LIGHTWEIGHT: Runs alongside abstract features, no impact if disabled
 * 
 * Important: This is NOT the primary detection mechanism. The system works well
 * with abstract spatial features (depth, motion, texture) alone. Semantic
 * classification is provided for educational purposes and community exploration.
 * 
 * Supported objects (extensible):
 * - person: High motion + concentrated edges
 * - tree: Rough texture (high Gabor response) + vertical gradient
 * - rough_ground: High texture variation + low edges
 * - trash: Irregular motion + mixed colors + random texture
 * - box: Rectangular edges + low texture variation
 * 
 * Usage:
 *   const detector = new SemanticFeatureDetector({ enabled: true });
 *   const semantic = detector.detectObjects({ gridFlows, textureGrid, abstractFeatures, statistics });
 *   // Returns array of { type, confidence, location, reasoning }
 * 
 * R171025 lets check how the audio pipeline handle this approach and document it
 * 
 */

export class SemanticFeatureDetector {
  constructor(options = {}) {
    this.enabled = options.enabled !== false; // Default: enabled
    this.confidence_threshold = options.confidence_threshold || 0.5;
    this.verbose = options.verbose || false;
  }

  /**
   * Detect semantic objects based on abstract features.
   * 
   * @param {object} input - Contains gridFlows, textureGrid, abstractFeatures, statistics
   * @returns {array} Array of detected objects: { type, confidence, location, reasoning }
   */
  detectObjects(input) {
    if (!this.enabled) {
      return [];
    }

    const { gridFlows, textureGrid, abstractFeatures, statistics } = input;
    if (!gridFlows || !textureGrid || !statistics) {
      return [];
    }

    const detections = [];

    // Try each detection heuristic
    const personDetection = this._detectPerson(gridFlows, textureGrid, statistics);
    if (personDetection) detections.push(personDetection);

    const treeDetection = this._detectTree(textureGrid, statistics);
    if (treeDetection) detections.push(treeDetection);

    const roughGroundDetection = this._detectRoughGround(textureGrid, gridFlows, statistics);
    if (roughGroundDetection) detections.push(roughGroundDetection);

    const trashDetection = this._detectTrash(gridFlows, textureGrid, statistics);
    if (trashDetection) detections.push(trashDetection);

    const boxDetection = this._detectBox(gridFlows, textureGrid, statistics);
    if (boxDetection) detections.push(boxDetection);

    // Filter by confidence threshold
    const filtered = detections.filter(d => d.confidence >= this.confidence_threshold);

    if (this.verbose && filtered.length > 0) {
      console.log('[SemanticDetector]', filtered);
    }

    return filtered;
  }

  /**
   * Detect person: high motion + concentrated edges + relatively uniform texture
   */
  _detectPerson(gridFlows, textureGrid, statistics) {
    const meanFlow = statistics.meanFlow || 0;
    const edgeEnergy = statistics.edgeEnergy || 0;
    const cellsActive = statistics.cellsActive || 0;
    const cellsTotal = statistics.cellsTotal || 1;

    const activity = cellsActive / cellsTotal;
    const isMoving = meanFlow > 8;
    const hasEdges = edgeEnergy > 1.5;
    const isConcentrated = activity > 0.4 && activity < 0.8; // Not too sparse, not too dense

    if (isMoving && hasEdges && isConcentrated) {
      const confidence = Math.min(
        1,
        (meanFlow / 15) * 0.5 + (edgeEnergy / 3) * 0.3 + (1 - Math.abs(activity - 0.6)) * 0.2
      );
      return {
        type: 'person',
        confidence,
        location: 'center',
        reasoning: `Moving object (flow=${meanFlow.toFixed(1)}, edges=${edgeEnergy.toFixed(1)}, activity=${activity.toFixed(2)})`,
      };
    }

    return null;
  }

  /**
   * Detect tree: high texture (rough bark) + vertical gradient + stable
   */
  _detectTree(textureGrid, gridFlows, statistics) {
    const edgeEnergy = statistics.edgeEnergy || 0;
    const meanFlow = statistics.meanFlow || 0;
    const rows = textureGrid.length;
    const cols = textureGrid[0]?.length || 1;

    // Check for vertical structure (tree typically tall)
    let verticalGradient = 0;
    for (let r = 1; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        verticalGradient += Math.abs(textureGrid[r][c] - textureGrid[r - 1][c]);
      }
    }
    verticalGradient /= (rows - 1) * cols || 1;

    const isTextureRich = edgeEnergy > 1.8;
    const isVertical = verticalGradient > 0.3;
    const isStable = meanFlow < 5;

    if (isTextureRich && isVertical && isStable) {
      const confidence = Math.min(
        1,
        (edgeEnergy / 3) * 0.5 + (verticalGradient / 1) * 0.3 + (1 - meanFlow / 10) * 0.2
      );
      return {
        type: 'tree',
        confidence,
        location: 'center',
        reasoning: `Textured vertical structure (edges=${edgeEnergy.toFixed(1)}, vertical=${verticalGradient.toFixed(2)})`,
      };
    }

    return null;
  }

  /**
   * Detect rough ground: low motion + high texture variation + large area
   */
  _detectRoughGround(textureGrid, gridFlows, statistics) {
    const edgeEnergy = statistics.edgeEnergy || 0;
    const meanFlow = statistics.meanFlow || 0;
    const cellsActive = statistics.cellsActive || 0;
    const cellsTotal = statistics.cellsTotal || 1;

    const activity = cellsActive / cellsTotal;
    const isStable = meanFlow < 3;
    const isRough = edgeEnergy > 1.5;
    const isCovering = activity > 0.6; // Covers much of frame

    if (isStable && isRough && isCovering) {
      const confidence = Math.min(
        1,
        (edgeEnergy / 2.5) * 0.5 + (isCovering ? 0.3 : 0) + (1 - meanFlow / 5) * 0.2
      );
      return {
        type: 'rough_ground',
        confidence,
        location: 'ground_plane',
        reasoning: `Textured stable surface (edges=${edgeEnergy.toFixed(1)}, coverage=${activity.toFixed(2)})`,
      };
    }

    return null;
  }

  /**
   * Detect trash: irregular motion + mixed intensity + random texture
   */
  _detectTrash(gridFlows, textureGrid, statistics) {
    const meanFlow = statistics.meanFlow || 0;
    const maxFlow = statistics.maxFlow || 0;
    const edgeEnergy = statistics.edgeEnergy || 0;

    // Trash has irregular, jerky motion
    const flowVariance = maxFlow - meanFlow;
    const hasIrregularMotion = flowVariance > 5;
    const isMoving = meanFlow > 4;
    const hasRandomTexture = edgeEnergy > 1.2 && edgeEnergy < 2.5; // Not too clean, not too rough

    if (hasIrregularMotion && isMoving && hasRandomTexture) {
      const confidence = Math.min(
        1,
        (flowVariance / 10) * 0.5 + (meanFlow / 15) * 0.3 + (1 - Math.abs(edgeEnergy - 1.8) / 2) * 0.2
      );
      return {
        type: 'trash',
        confidence,
        location: 'foreground',
        reasoning: `Irregular motion (flow_var=${flowVariance.toFixed(1)}, texture=${edgeEnergy.toFixed(1)})`,
      };
    }

    return null;
  }

  /**
   * Detect box: rectangular edges + low texture + stable
   */
  _detectBox(gridFlows, textureGrid, statistics) {
    const edgeEnergy = statistics.edgeEnergy || 0;
    const meanFlow = statistics.meanFlow || 0;
    const cellsActive = statistics.cellsActive || 0;
    const cellsTotal = statistics.cellsTotal || 1;

    // Check for rectangular pattern (edges at boundaries)
    const rows = textureGrid.length;
    const cols = textureGrid[0]?.length || 1;
    let borderEnergy = 0;
    let count = 0;

    // Top and bottom rows
    for (let c = 0; c < cols; c++) {
      borderEnergy += (textureGrid[0]?.[c] || 0) + (textureGrid[rows - 1]?.[c] || 0);
      count += 2;
    }
    // Left and right columns
    for (let r = 0; r < rows; r++) {
      borderEnergy += (textureGrid[r]?.[0] || 0) + (textureGrid[r]?.[cols - 1] || 0);
      count += 2;
    }
    borderEnergy /= count || 1;

    const activity = cellsActive / cellsTotal;
    const hasEdges = borderEnergy > 1.0;
    const isStable = meanFlow < 4;
    const isCompact = activity > 0.3 && activity < 0.7; // Not scattered, not solid

    if (hasEdges && isStable && isCompact) {
      const confidence = Math.min(
        1,
        (borderEnergy / 2) * 0.5 + (1 - meanFlow / 8) * 0.3 + (1 - Math.abs(activity - 0.5)) * 0.2
      );
      return {
        type: 'box',
        confidence,
        location: 'center',
        reasoning: `Rectangular object (border_edges=${borderEnergy.toFixed(1)}, activity=${activity.toFixed(2)})`,
      };
    }

    return null;
  }

  /**
   * Enable/disable semantic detection.
   */
  setEnabled(enabled) {
    this.enabled = enabled;
  }

  /**
   * Set confidence threshold for detections (0-1).
   */
  setConfidenceThreshold(threshold) {
    this.confidence_threshold = Math.max(0, Math.min(1, threshold));
  }
}

export default SemanticFeatureDetector;
