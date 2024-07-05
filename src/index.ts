/// <reference types="w3c-web-usb" />

import { image2BitmapDataChunked, wrapData4Table } from './utils';

export class EscPos {
  static async connect(filters: USBDeviceFilter[]) {
    const device = await navigator.usb.requestDevice({
      filters,
    });
    if (!device || !device.configuration) {
      throw new Error('Device not selected');
    }
    const endpointNumber =
      device.configuration.interfaces?.[0]?.alternate.endpoints.find(
        (obj: USBEndpoint) => obj.direction === 'out'
      )?.endpointNumber;
    if (!endpointNumber) {
      throw new Error('Device not available');
    }

    const escPosDevice = new EscPosDevice(device, endpointNumber);
    await escPosDevice.device.open();
    await escPosDevice.device.selectConfiguration(1);
    await escPosDevice.device.claimInterface(0);
    return escPosDevice;
  }

  static async disconnect(escPosDevice: EscPosDevice) {
    await escPosDevice.device.close();
  }
}

type Size = 'normal' | '2height' | '2width' | '4square';
type Justification = 'left' | 'center' | 'right';

export class EscPosDevice {
  private _device: USBDevice;
  private endpointNumber: number;
  private encoder = new TextEncoder();

  public get device() {
    return this._device;
  }

  constructor(device: USBDevice, endpointNumber: number) {
    this._device = device;
    this.endpointNumber = endpointNumber;
  }

  async reset() {
    await this.device.transferOut(
      this.endpointNumber,
      new Uint8Array(this.encoder.encode('\x1b\x40'))
    );
  }

  async newLine(count = 1) {
    if (count < 1) {
      return;
    }
    const command = '\x0a';
    await this.device.transferOut(
      this.endpointNumber,
      new Uint8Array(this.encoder.encode(command.repeat(count)))
    );
  }

  async partialCut(newLineCount: number = 5) {
    await this.newLine(newLineCount);
    const command = '\x1d\x56\x01';
    await this.device.transferOut(
      this.endpointNumber,
      new Uint8Array(this.encoder.encode(command))
    );
  }

  async fullCut() {
    const command = '\x1d\x56\x00';
    await this.device.transferOut(
      this.endpointNumber,
      new Uint8Array(this.encoder.encode(command))
    );
  }

  async image(src: string, width: number, maxWidth: number, feedCount = 0) {
    const imageCommand = [
      0x1b,
      0x2a,
      0x00,
      maxWidth % 256,
      (maxWidth - (maxWidth % 256)) / 256,
    ];
    const bitmapDataChunked = await image2BitmapDataChunked(
      src,
      width,
      maxWidth
    );
    for (const bitmapDataChunk of bitmapDataChunked) {
      const command = [...imageCommand];
      command.push(...bitmapDataChunk);
      await this.device.transferOut(
        this.endpointNumber,
        new Uint8Array(command)
      );
      if (feedCount > 0 && feedCount <= 255) {
        await this.device.transferOut(
          this.endpointNumber,
          new Uint8Array([0x1b, 0x4a, feedCount])
        );
      }
    }
  }

  async table(
    widths: number[],
    justifications: Justification[],
    data: string[][]
  ) {
    const table = wrapData4Table(widths, data);
    for (const row of table) {
      let line = '';
      for (let colIndex = 0; colIndex < row.length; colIndex++) {
        const col = row[colIndex];
        switch (justifications[colIndex]) {
          case 'left':
            line += col.padEnd(widths[colIndex], ' ');
            break;
          case 'center':
            line += (
              ' '.repeat(Math.round((widths[colIndex] - col.length) / 2)) + col
            ).padEnd(widths[colIndex], ' ');
            break;
          case 'right':
            line += col.padStart(widths[colIndex], ' ');
            break;
        }
      }
      await this.text(line);
    }
  }

  async justify(justification: Justification) {
    const commandJustification =
      justification === 'left'
        ? '\x00'
        : justification === 'center'
          ? '\x01'
          : justification === 'right'
            ? '\x02'
            : '\x00';
    await this.device.transferOut(
      this.endpointNumber,
      new Uint8Array(this.encoder.encode(`\x1b\x61${commandJustification}`))
    );
  }

  async bold(enable = true) {
    const commandBold = enable ? '\x01' : '\x00';
    await this.device.transferOut(
      this.endpointNumber,
      new Uint8Array(this.encoder.encode(`\x1b\x45${commandBold}`))
    );
  }

  async size(size: Size) {
    const sizes = new Map<Size, string>([
      ['normal', '\x1b\x21\x00'], // Normal text
      ['2height', '\x1b\x21\x10'], // Double height text
      ['2width', '\x1b\x21\x20'], // Double width text
      ['4square', '\x1b\x21\x30'], // Double width & height text
    ]);

    await this.device.transferOut(
      this.endpointNumber,
      new Uint8Array(this.encoder.encode(sizes.get(size)))
    );
  }

  async text(text: string) {
    await this.device.transferOut(
      this.endpointNumber,
      new Uint8Array(this.encoder.encode(text + '\n'))
    );
  }
}
