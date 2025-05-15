(function (global, factory) {
  if (typeof exports === 'object' && typeof module !== 'undefined') {
    module.exports = factory();
  } else if (typeof define === 'function' && define.amd) {
    define(factory);
  } else {
    global.FFT = factory();
  }
}(this, function () {
  'use strict';

  function FFT(size) {
    this.size = size | 0;
    if (this.size <= 1 || (this.size & (this.size - 1)) !== 0)
      throw new Error('FFT size must be a power of two and bigger than 1');

    this._csize = size << 1;

    var table = new Array(this.size * 2);
    for (var i = 0; i < table.length; i += 2) {
      var angle = Math.PI * i / this.size;
      table[i] = Math.cos(angle);
      table[i + 1] = -Math.sin(angle);
    }
    this.table = table;

    var power = 0;
    for (var t = 1; this.size > t; t <<= 1)
      power++;

    var shift = power % 2 === 0 ? power - 1 : power;

    this._width = shift;
    this._bitrev = new Array(1 << shift);
    for (var j = 0; j < this._bitrev.length; j++) {
      this._bitrev[j] = 0;
      for (var shift = 0; shift < this._width; shift += 2) {
        var revShift = this._width - shift - 2;
        this._bitrev[j] |= ((j >>> shift) & 3) << revShift;
      }
    }

    this._out = null;
    this._data = null;
    this._inv = 0;
  }

  FFT.prototype.fromComplexArray = function fromComplexArray(complex, storage) {
    var res = storage || new Array(complex.length >>> 1);
    for (var i = 0; i < complex.length; i += 2)
      res[i >>> 1] = complex[i];
    return res;
  };

  FFT.prototype.createComplexArray = function createComplexArray() {
    var res = new Array(this._csize);
    for (var i = 0; i < res.length; i++)
      res[i] = 0;
    return res;
  };

  FFT.prototype.toComplexArray = function toComplexArray(input, storage) {
    var res = storage || this.createComplexArray();
    for (var i = 0; i < res.length; i += 2) {
      res[i] = input[i >>> 1];
      res[i + 1] = 0;
    }
    return res;
  };

  FFT.prototype.completeSpectrum = function completeSpectrum(spectrum) {
    var size = this._csize;
    var half = size >>> 1;
    for (var i = 2; i < half; i += 2) {
      spectrum[size - i] = spectrum[i];
      spectrum[size - i + 1] = -spectrum[i + 1];
    }
  };

  FFT.prototype.transform = function transform(out, data) {
    if (out === data)
      throw new Error('Input and output buffers must be different');

    this._out = out;
    this._data = data;
    this._inv = 0;
    this._transform4();
    this._out = null;
    this._data = null;
  };

  FFT.prototype.realTransform = function realTransform(out, data) {
    if (out === data)
      throw new Error('Input and output buffers must be different');

    this._out = out;
    this._data = data;
    this._inv = 0;
    this._realTransform4();
    this._out = null;
    this._data = null;
  };

  FFT.prototype.inverseTransform = function inverseTransform(out, data) {
    if (out === data)
      throw new Error('Input and output buffers must be different');

    this._out = out;
    this._data = data;
    this._inv = 1;
    this._transform4();
    for (var i = 0; i < out.length; i++)
      out[i] /= this.size;
    this._out = null;
    this._data = null;
  };

  FFT.prototype._transform4 = function _transform4() {
    var out = this._out;
    var size = this._csize;

    var width = this._width;
    var step = 1 << width;
    var len = (size / step) << 1;

    var outOff;
    var t;
    var bitrev = this._bitrev;

    if (len === 4) {
      for (outOff = 0, t = 0; outOff < size; outOff += len, t++) {
        var off = bitrev[t];
        this._singleTransform2(outOff, off, step);
      }
    } else {
      for (outOff = 0, t = 0; outOff < size; outOff += len, t++) {
        var off = bitrev[t];
        this._singleTransform4(outOff, off, step);
      }
    }

    var inv = this._inv ? -1 : 1;
    var table = this.table;
    for (step >>= 2; step >= 2; step >>= 2) {
      len = (size / step) << 1;
      var quarterLen = len >>> 2;

      for (outOff = 0; outOff < size; outOff += len) {
        var limit = outOff + quarterLen;

        for (var i = outOff, k = 0; i < limit; i += 2, k += step) {
          var A = i;
          var B = A + quarterLen;
          var C = B + quarterLen;
          var D = C + quarterLen;

          var Ar = out[A];
          var Ai = out[A + 1];
          var Br = out[B];
          var Bi = out[B + 1];
          var Cr = out[C];
          var Ci = out[C + 1];
          var Dr = out[D];
          var Di = out[D + 1];

          var MAr = Ar;
          var MAi = Ai;

          var tableBr = table[k];
          var tableBi = inv * table[k + 1];
          var MBr = Br * tableBr - Bi * tableBi;
          var MBi = Br * tableBi + Bi * tableBr;

          var tableCr = table[2 * k];
          var tableCi = inv * table[2 * k + 1];
          var MCr = Cr * tableCr - Ci * tableCi;
          var MCi = Cr * tableCi + Ci * tableCr;

          var tableDr = table[3 * k];
          var tableDi = inv * table[3 * k + 1];
          var MDr = Dr * tableDr - Di * tableDi;
          var MDi = Dr * tableDi + Di * tableDr;

          var T0r = MAr + MCr;
          var T0i = MAi + MCi;
          var T1r = MAr - MCr;
          var T1i = MAi - MCi;
          var T2r = MBr + MDr;
          var T2i = MBi + MDi;
          var T3r = inv * (MBr - MDr);
          var T3i = inv * (MBi - MDi);

          out[A] = T0r + T2r;
          out[A + 1] = T0i + T2i;
          out[B] = T1r + T3r;
          out[B + 1] = T1i + T3i;
          out[C] = T0r - T2r;
          out[C + 1] = T0i - T2i;
          out[D] = T1r - T3r;
          out[D + 1] = T1i - T3i;
        }
      }
    }
  };

  FFT.prototype._singleTransform2 = function _singleTransform2(outOff, off, step) {
    var out = this._out;
    var data = this._data;

    var evenR = data[off];
    var evenI = data[off + 1];
    var oddR = data[off + step];
    var oddI = data[off + step + 1];

    var leftR = evenR + oddR;
    var leftI = evenI + oddI;
    var rightR = evenR - oddR;
    var rightI = evenI - oddI;

    out[outOff] = leftR;
    out[outOff + 1] = leftI;
    out[outOff + 2] = rightR;
    out[outOff + 3] = rightI;
  };

  FFT.prototype._singleTransform4 = function _singleTransform4(outOff, off, step) {
    var out = this._out;
    var data = this._data;
    var inv = this._inv ? -1 : 1;
    var step2 = step * 2;
    var step3 = step * 3;

    var Ar = data[off];
    var Ai = data[off + 1];
    var Br = data[off + step];
    var Bi = data[off + step + 1];
    var Cr = data[off + step2];
    var Ci = data[off + step2 + 1];
    var Dr = data[off + step3];
    var Di = data[off + step3 + 1];

    var T0r = Ar + Cr;
    var T0i = Ai + Ci;
    var T1r = Ar - Cr;
    var T1i = Ai - Ci;
    var T2r = Br + Dr;
    var T2i = Bi + Di;
    var T3r = inv * (Br - Dr);
    var T3i = inv * (Bi - Di);

    out[outOff] = T0r + T2r;
    out[outOff + 1] = T0i + T2i;
    out[outOff + 2] = T1r + T3r;
    out[outOff + 3] = T1i + T3i;
    out[outOff + 4] = T0r - T2r;
    out[outOff + 5] = T0i - T2i;
    out[outOff + 6] = T1r - T3r;
    out[outOff + 7] = T1i - T3i;
  };

  FFT.prototype._realTransform4 = function _realTransform4() {
    var out = this._out;
    var size = this._csize;

    var width = this._width;
    var step = 1 << width;
    var len = (size / step) << 1;

    var outOff;
    var t;
    var bitrev = this._bitrev;

    if (len === 4) {
      for (outOff = 0, t = 0; outOff < size; outOff += len, t++) {
        var off = bitrev[t];
        this._singleRealTransform2(outOff, off >>> 1, step >>> 1);
      }
    } else {
      for (outOff = 0, t = 0; outOff < size; outOff += len, t++) {
        var off = bitrev[t];
        this._singleRealTransform4(outOff, off >>> 1, step >>> 1);
      }
    }

    var inv = this._inv ? -1 : 1;
    var table = this.table;
    for (step >>= 2; step >= 2; step >>= 2) {
      len = (size / step) << 1;
      var halfLen = len >>> 1;
      var quarterLen = halfLen >>> 1;
      var hquarterLen = quarterLen >>> 1;

      for (outOff = 0; outOff < size; outOff += len) {
        for (var i = 0, k = 0; i <= hquarterLen; i += 2, k += step) {
          var A = outOff + i;
          var B = A + quarterLen;
          var C = B + quarterLen;
          var D = C + quarterLen;

          var Ar = out[A];
          var Ai = out[A + 1];
          var Br = out[B];
          var Bi = out[B + 1];
          var Cr = out[C];
          var Ci = out[C + 1];
          var Dr = out[D];
          var Di = out[D + 1];

          var MAr = Ar;
          var MAi = Ai;

          var tableBr = table[k];
          var tableBi = inv * table[k + 1];
          var MBr = Br * tableBr - Bi * tableBi;
          var MBi = Br * tableBi + Bi * tableBr;

          var tableCr = table[2 * k];
          var tableCi = inv * table[2 * k + 1];
          var MCr = Cr * tableCr - Ci * tableCi;
          var MCi = Cr * tableCi + Ci * tableCr;

          var tableDr = table[3 * k];
          var tableDi = inv * table[3 * k + 1];
          var MDr = Dr * tableDr - Di * tableDi;
          var MDi = Dr * tableDi + Di * tableDr;

          var T0r = MAr + MCr;
          var T0i = MAi + MCi;
          var T1r = MAr - MCr;
          var T1i = MAi - MCi;
          var T2r = MBr + MDr;
          var T2i = MBi + MDi;
          var T3r = inv * (MBr - MDr);
          var T3i = inv * (MBi - MDi);

          var FAr = T0r + T2r;
          var FAi = T0i + T2i;

          var FCr = T0r - T2r;
          var FCi = T0i - T2i;

          var FBr = T1r + T3r;
          var FBi = T1i + T3i;

          var FDr = T1r - T3r;
          var FDi = T1i - T3i;

          out[A] = FAr;
          out[A + 1] = FAi;
          out[B] = FBr;
          out[B + 1] = FBi;

          if (i === 0) {
            out[C] = FCr;
            out[C + 1] = FCi;
          } else {
            if (i !== hquarterLen) {
              var SA = outOff + halfLen - i;
              var SB = SA + quarterLen;
              var SC = SB + quarterLen;
              var SD = SC + quarterLen;

              out[SA] = FBr;
              out[SA + 1] = -FBi;
              out[SB] = FDr;
              out[SB + 1] = -FDi;
              out[SC] = FCr;
              out[SC + 1] = -FCi;
            } else {
              out[C] = FCr;
              out[C + 1] = FCi;
            }
          }
        }
      }
    }
  };

  FFT.prototype._singleRealTransform2 = function _singleRealTransform2(outOff, off, step) {
    var out = this._out;
    var data = this._data;

    var evenR = data[off];
    var oddR = data[off + step];

    var leftR = evenR + oddR;
    var rightR = evenR - oddR;

    out[outOff] = leftR;
    out[outOff + 1] = 0;
    out[outOff + 2] = rightR;
    out[outOff + 3] = 0;
  };

  FFT.prototype._singleRealTransform4 = function _singleRealTransform4(outOff, off, step) {
    var out = this._out;
    var data = this._data;
    var inv = this._inv ? -1 : 1;
    var step2 = step * 2;
    var step3 = step * 3;

    var Ar = data[off];
    var Br = data[off + step];
    var Cr = data[off + step2];
    var Dr = data[off + step3];

    var T0r = Ar + Cr;
    var T1r = Ar - Cr;
    var T2r = Br + Dr;
    var T3r = inv * (Br - Dr);

    out[outOff] = T0r + T2r;
    out[outOff + 1] = 0;
    out[outOff + 2] = T1r;
    out[outOff + 3] = -T3r;
    out[outOff + 4] = T0r - T2r;
    out[outOff + 5] = 0;
    out[outOff + 6] = T1r;
    out[outOff + 7] = T3r;
  };

  return FFT;
}));
