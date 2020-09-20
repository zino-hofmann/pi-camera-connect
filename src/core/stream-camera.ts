import { ChildProcessWithoutNullStreams, spawn } from 'child_process';
import { EventEmitter } from 'events';
import * as stream from 'stream';
import * as si from 'systeminformation';

import { AwbMode, ExposureMode, Flip, Rotation } from '../typings';
import { getSharedArgs } from './shared-args';

export enum Codec {
  H264 = 'H264',
  MJPEG = 'MJPEG',
}

export enum SensorMode {
  AutoSelect = 0,
  Mode1 = 1,
  Mode2 = 2,
  Mode3 = 3,
  Mode4 = 4,
  Mode5 = 5,
  Mode6 = 6,
  Mode7 = 7,
}

export interface StreamOptions {
  width?: number;
  height?: number;
  rotation?: Rotation;
  flip?: Flip;
  bitRate?: number;
  fps?: number;
  codec?: Codec;
  sensorMode?: SensorMode;
  shutter?: number;
  sharpness?: number;
  contrast?: number;
  brightness?: number;
  saturation?: number;
  iso?: number;
  exposureCompensation?: number;
  exposureMode?: ExposureMode;
  awbMode?: AwbMode;
  analogGain?: number;
  digitalGain?: number;
}

declare interface StreamCamera {
  on(event: 'frame', listener: (image: Buffer) => void): this;
  once(event: 'frame', listener: (image: Buffer) => void): this;
}

class StreamCamera extends EventEmitter {
  private readonly options: StreamOptions;

  private childProcess?: ChildProcessWithoutNullStreams;

  private streams: Array<stream.Readable> = [];

  constructor(options: StreamOptions = {}) {
    super();

    this.options = {
      rotation: Rotation.Rotate0,
      flip: Flip.None,
      bitRate: 17000000,
      fps: 30,
      codec: Codec.H264,
      sensorMode: SensorMode.AutoSelect,
      ...options,
    };
  }

  static async getJpegSignature(): Promise<Buffer> {
    const systemInfo = await si.system();

    switch (systemInfo.model) {
      case 'BCM2711':
      case 'BCM2835 - Pi 3 Model B':
      case 'BCM2835 - Pi 3 Model B+':
      case 'BCM2835 - Pi 4 Model B':
      case 'BCM2835 - Pi Zero':
      case 'BCM2835 - Pi Zero W':
      case 'Docker Container':
        return Buffer.from([0xff, 0xd8, 0xff, 0xdb, 0x00, 0x84, 0x00]);
      default:
        throw new Error(
          `Could not determine JPEG signature. Unknown system model '${systemInfo.model}'`
        );
    }
  }

  startCapture(): Promise<void> {
    // eslint-disable-next-line no-async-promise-executor, consistent-return
    return new Promise(async (resolve, reject) => {
      // TODO: refactor promise logic to be more ergonomic
      // so that we don't need to try/catch here
      try {
        const args: Array<string> = [
          /**
           * Add the command-line arguments that are common to both `raspivid` and `raspistill`
           */
          ...getSharedArgs(this.options),

          /**
           * Bit rate
           */
          ...(this.options.bitRate
            ? ['--bitrate', this.options.bitRate.toString()]
            : []),

          /**
           * Frame rate
           */
          ...(this.options.fps
            ? ['--framerate', this.options.fps.toString()]
            : []),

          /**
           * Codec
           *
           * H264 or MJPEG
           *
           */
          ...(this.options.codec
            ? ['--codec', this.options.codec.toString()]
            : []),

          /**
           * Sensor mode
           *
           * Camera version 1.x (OV5647):
           *
           * | Mode |        Size         | Aspect Ratio | Frame rates |   FOV   |    Binning    |
           * |------|---------------------|--------------|-------------|---------|---------------|
           * |    0 | automatic selection |              |             |         |               |
           * |    1 | 1920x1080           | 16:9         | 1-30fps     | Partial | None          |
           * |    2 | 2592x1944           | 4:3          | 1-15fps     | Full    | None          |
           * |    3 | 2592x1944           | 4:3          | 0.1666-1fps | Full    | None          |
           * |    4 | 1296x972            | 4:3          | 1-42fps     | Full    | 2x2           |
           * |    5 | 1296x730            | 16:9         | 1-49fps     | Full    | 2x2           |
           * |    6 | 640x480             | 4:3          | 42.1-60fps  | Full    | 2x2 plus skip |
           * |    7 | 640x480             | 4:3          | 60.1-90fps  | Full    | 2x2 plus skip |
           *
           *
           * Camera version 2.x (IMX219):
           *
           * | Mode |        Size         | Aspect Ratio | Frame rates |   FOV   | Binning |
           * |------|---------------------|--------------|-------------|---------|---------|
           * |    0 | automatic selection |              |             |         |         |
           * |    1 | 1920x1080           | 16:9         | 0.1-30fps   | Partial | None    |
           * |    2 | 3280x2464           | 4:3          | 0.1-15fps   | Full    | None    |
           * |    3 | 3280x2464           | 4:3          | 0.1-15fps   | Full    | None    |
           * |    4 | 1640x1232           | 4:3          | 0.1-40fps   | Full    | 2x2     |
           * |    5 | 1640x922            | 16:9         | 0.1-40fps   | Full    | 2x2     |
           * |    6 | 1280x720            | 16:9         | 40-90fps    | Partial | 2x2     |
           * |    7 | 640x480             | 4:3          | 40-90fps    | Partial | 2x2     |
           *
           */
          ...(this.options.sensorMode
            ? ['--mode', this.options.sensorMode.toString()]
            : []),

          /**
           * Capture time (ms)
           *
           * Zero = forever
           *
           */
          '--timeout',
          (0).toString(),

          /**
           * Do not display preview overlay on screen
           */
          '--nopreview',

          /**
           * Output to stdout
           */
          '--output',
          '-',
        ];

        // Spawn child process
        this.childProcess = spawn('raspivid', args);

        // Listen for error event to reject promise
        this.childProcess.once('error', () =>
          reject(
            new Error(
              "Could not start capture with StreamCamera. Are you running on a Raspberry Pi with 'raspivid' installed?"
            )
          )
        );

        // Wait for first data event to resolve promise
        this.childProcess.stdout.once('data', () => resolve());

        const jpegSignature = await StreamCamera.getJpegSignature();
        let stdoutBuffer = Buffer.alloc(0);

        // Listen for image data events and parse MJPEG frames if codec is MJPEG
        this.childProcess.stdout.on('data', (data: Buffer) => {
          this.streams.forEach((innerStream) => innerStream.push(data));

          if (this.options.codec !== Codec.MJPEG) {
            return;
          }

          stdoutBuffer = Buffer.concat([stdoutBuffer, data]);

          // Extract all image frames from the current buffer
          // eslint-disable-next-line no-constant-condition
          while (true) {
            const signatureIndex = stdoutBuffer.indexOf(jpegSignature, 0);

            if (signatureIndex === -1) break;

            // Make sure the signature starts at the beginning of the buffer
            if (signatureIndex > 0)
              stdoutBuffer = stdoutBuffer.slice(signatureIndex);

            const nextSignatureIndex = stdoutBuffer.indexOf(
              jpegSignature,
              jpegSignature.length
            );

            if (nextSignatureIndex === -1) break;

            this.emit('frame', stdoutBuffer.slice(0, nextSignatureIndex));

            stdoutBuffer = stdoutBuffer.slice(nextSignatureIndex);
          }
        });

        // Listen for error events
        this.childProcess.stdout.on('error', (err) => this.emit('error', err));
        this.childProcess.stderr.on('data', (data) =>
          this.emit('error', new Error(data.toString()))
        );
        this.childProcess.stderr.on('error', (err) => this.emit('error', err));

        // Listen for close events
        this.childProcess.stdout.on('close', () => this.emit('close'));
      } catch (err) {
        return reject(err);
      }
    });
  }

  async stopCapture(): Promise<void> {
    if (this.childProcess) {
      this.childProcess.kill();
    }

    // Push null to each stream to indicate EOF
    // tslint:disable-next-line no-null-keyword
    this.streams.forEach((innerStream) => innerStream.push(null));

    this.streams = [];
  }

  createStream(): stream.Readable {
    const newStream = new stream.Readable({
      // eslint-disable-next-line @typescript-eslint/no-empty-function
      read: () => {},
    });

    this.streams.push(newStream);

    return newStream;
  }

  takeImage(): Promise<Buffer> {
    if (this.options.codec !== Codec.MJPEG) {
      throw new Error("Codec must be 'MJPEG' to take image");
    }

    return new Promise<Buffer>((resolve) =>
      this.once('frame', (data) => resolve(data))
    );
  }
}

export default StreamCamera;
