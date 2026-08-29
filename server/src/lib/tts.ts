import { spawn } from 'node:child_process';
import { env } from '../config/env';
import { HttpError } from '../utils/httpError';

export const ttsConfigured = (): boolean => Boolean(env.PIPER_BIN && env.PIPER_MODEL);

export interface TtsResult {
  pcm: Buffer; // raw signed 16-bit little-endian mono PCM
  sampleRate: number;
}

/**
 * Synthesizes speech with a local Piper voice. `--output-raw` streams raw int16
 * mono PCM on stdout at the model's sample rate (set PIPER_SAMPLE_RATE to match).
 */
export function synthesizePcm(text: string): Promise<TtsResult> {
  if (!env.PIPER_BIN || !env.PIPER_MODEL) {
    return Promise.reject(new HttpError(503, 'TTS not configured. Set PIPER_BIN and PIPER_MODEL.'));
  }

  return new Promise<TtsResult>((resolve, reject) => {
    const proc = spawn(env.PIPER_BIN as string, ['--model', env.PIPER_MODEL as string, '--output-raw'], {
      stdio: ['pipe', 'pipe', 'pipe'],
    });

    const chunks: Buffer[] = [];
    let stderr = '';
    proc.stdout.on('data', (d: Buffer) => chunks.push(d));
    proc.stderr.on('data', (d: Buffer) => {
      stderr += d.toString();
    });
    proc.on('error', (e) => reject(new HttpError(500, `Piper failed to start: ${e.message}`)));
    proc.on('close', (code) => {
      if (code !== 0) {
        reject(new HttpError(500, `Piper exited ${code}: ${stderr.slice(0, 200)}`));
        return;
      }
      resolve({ pcm: Buffer.concat(chunks), sampleRate: env.PIPER_SAMPLE_RATE });
    });

    proc.stdin.write(text);
    proc.stdin.end();
  });
}
