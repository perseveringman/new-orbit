class TestDOMMatrix {
  a = 1;
  b = 0;
  c = 0;
  d = 1;
  e = 0;
  f = 0;

  multiplySelf(): this {
    return this;
  }

  preMultiplySelf(): this {
    return this;
  }

  translateSelf(): this {
    return this;
  }

  scaleSelf(): this {
    return this;
  }
}

class TestPath2D {}

class TestImageData {
  readonly data: Uint8ClampedArray;
  readonly width: number;
  readonly height: number;

  constructor(width: number, height: number) {
    this.width = width;
    this.height = height;
    this.data = new Uint8ClampedArray(width * height * 4);
  }
}

Object.defineProperty(globalThis, 'DOMMatrix', {
  value: globalThis.DOMMatrix ?? TestDOMMatrix,
  configurable: true,
  writable: true
});

Object.defineProperty(globalThis, 'Path2D', {
  value: globalThis.Path2D ?? TestPath2D,
  configurable: true,
  writable: true
});

Object.defineProperty(globalThis, 'ImageData', {
  value: globalThis.ImageData ?? TestImageData,
  configurable: true,
  writable: true
});
