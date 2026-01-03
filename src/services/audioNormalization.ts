import { exec } from 'child_process';
import { promisify } from 'util';
import fs from 'fs';

const execAsync = promisify(exec);

/**
 * YouTube's recommended loudness level is -14 LUFS (Integrated Loudness).
 * This is the target we'll normalize to.
 */
const TARGET_LUFS = -14;
const TARGET_TRUE_PEAK = -1;
const TARGET_LRA = 11; // Loudness Range

interface LoudnormStats {
  input_i: number;
  input_tp: number;
  input_lra: number;
  input_thresh: number;
  output_i: number;
  output_tp: number;
  output_lra: number;
  output_thresh: number;
  normalization_type: string;
  target_offset: number;
}

/**
 * Analyzes the loudness of a video file using FFmpeg's loudnorm filter.
 * Returns the measured loudness statistics.
 */
async function analyzeLoudness(inputPath: string): Promise<LoudnormStats> {
  console.log(`[AudioNorm] Analyzing loudness: ${inputPath}`);
  
  // First pass: measure loudness
  const analyzeCommand = `ffmpeg -i "${inputPath}" -af "loudnorm=I=${TARGET_LUFS}:TP=${TARGET_TRUE_PEAK}:LRA=${TARGET_LRA}:print_format=json" -f null - 2>&1`;
  
  try {
    const { stdout, stderr } = await execAsync(analyzeCommand);
    const output = stdout + stderr;
    
    // Extract the JSON from the output
    const jsonMatch = output.match(/\{[\s\S]*"input_i"[\s\S]*"target_offset"[\s\S]*?\}/);
    if (!jsonMatch) {
      throw new Error('Could not parse loudnorm analysis output');
    }
    
    const stats = JSON.parse(jsonMatch[0]) as LoudnormStats;
    console.log(`[AudioNorm] Current loudness: ${stats.input_i} LUFS, True Peak: ${stats.input_tp} dB`);
    
    return stats;
  } catch (error) {
    console.error('[AudioNorm] Analysis failed:', error);
    throw error;
  }
}

/**
 * Normalizes audio in a video file to YouTube's recommended -14 LUFS.
 * Uses a two-pass approach for optimal quality.
 * 
 * @param inputPath - Path to the input video file
 * @param outputPath - Path for the normalized output video file
 * @returns The path to the normalized video file
 */
export async function normalizeAudioToYouTubeLoudness(
  inputPath: string,
  outputPath?: string
): Promise<string> {
  if (!fs.existsSync(inputPath)) {
    throw new Error(`Input file does not exist: ${inputPath}`);
  }

  // Generate output path if not provided
  const finalOutputPath = outputPath ?? inputPath.replace(/\.mp4$/, '-normalized.mp4');
  
  console.log(`[AudioNorm] Starting normalization to ${TARGET_LUFS} LUFS`);
  console.log(`[AudioNorm] Input: ${inputPath}`);
  console.log(`[AudioNorm] Output: ${finalOutputPath}`);

  try {
    // Pass 1: Analyze the audio
    const stats = await analyzeLoudness(inputPath);
    
    console.log(`[AudioNorm] Applying normalization with measured offset: ${stats.target_offset} dB`);

    // Pass 2: Apply normalization using measured values for optimal quality
    const normalizeCommand = `ffmpeg -y -i "${inputPath}" -af "loudnorm=I=${TARGET_LUFS}:TP=${TARGET_TRUE_PEAK}:LRA=${TARGET_LRA}:measured_I=${stats.input_i}:measured_TP=${stats.input_tp}:measured_LRA=${stats.input_lra}:measured_thresh=${stats.input_thresh}:offset=${stats.target_offset}:linear=true:print_format=summary" -c:v copy "${finalOutputPath}"`;
    
    await execAsync(normalizeCommand);
    
    // Verify the normalization worked
    const verifyStats = await analyzeLoudness(finalOutputPath);
    console.log(`[AudioNorm] Normalized loudness: ${verifyStats.input_i} LUFS (Target: ${TARGET_LUFS} LUFS)`);
    
    // If the original path was requested to be overwritten,
    // replace the original file with the normalized one
    if (!outputPath) {
      // Create temp file, then replace original
      const tempPath = inputPath.replace(/\.mp4$/, '-temp-original.mp4');
      fs.renameSync(inputPath, tempPath);
      fs.renameSync(finalOutputPath, inputPath);
      fs.unlinkSync(tempPath);
      console.log(`[AudioNorm] Replaced original file with normalized version`);
      return inputPath;
    }
    
    return finalOutputPath;
  } catch (error) {
    console.error('[AudioNorm] Normalization failed:', error);
    throw error;
  }
}

/**
 * Quick single-pass normalization (faster but less accurate).
 * Good for when speed is more important than perfect accuracy.
 */
export async function normalizeAudioQuick(inputPath: string): Promise<string> {
  if (!fs.existsSync(inputPath)) {
    throw new Error(`Input file does not exist: ${inputPath}`);
  }

  const outputPath = inputPath.replace(/\.mp4$/, '-normalized.mp4');
  
  console.log(`[AudioNorm] Quick normalization to ${TARGET_LUFS} LUFS`);

  // Single-pass normalization (dynamic mode)
  const command = `ffmpeg -y -i "${inputPath}" -af "loudnorm=I=${TARGET_LUFS}:TP=${TARGET_TRUE_PEAK}:LRA=${TARGET_LRA}" -c:v copy "${outputPath}"`;
  
  await execAsync(command);
  
  // Replace original with normalized version
  const tempPath = inputPath.replace(/\.mp4$/, '-temp-original.mp4');
  fs.renameSync(inputPath, tempPath);
  fs.renameSync(outputPath, inputPath);
  fs.unlinkSync(tempPath);
  
  console.log(`[AudioNorm] Quick normalization complete`);
  return inputPath;
}

/**
 * Check current loudness of a video without normalizing.
 * Returns the integrated loudness in LUFS.
 */
export async function checkLoudness(inputPath: string): Promise<{ lufs: number; truePeak: number }> {
  const stats = await analyzeLoudness(inputPath);
  return {
    lufs: stats.input_i,
    truePeak: stats.input_tp
  };
}
