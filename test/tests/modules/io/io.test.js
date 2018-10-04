const cv = global.dut;
const fs = require('fs');
const path = require('path');

const {
  assertDataDeepEquals,
  assertMetaData,
  _asyncFuncShouldRequireArgs,
  funcShouldRequireArgs,
  getTestImagePath,
  clearTmpData,
  getTmpDataFilePath,
  fileExists,
  readTestImage,
  generateAPITests
} = global.utils;

const { expect } = require('chai');

const videoCaptureTests = require('./videoCaptureTests');
const videoWriterTests = require('./videoWriterTests');

describe('io', () => {
  let lenna;
  let got;
  let lennaBase64Buf;
  let gotBase64Buf;

  const getLennaBase64Buf = () => lennaBase64Buf;
  const getGotBase64Buf = () => gotBase64Buf;

  before(() => {
    lenna = readTestImage();
    got = readTestImage(false);
    lennaBase64Buf = Buffer.from(JSON.parse(fs.readFileSync(path.join(__dirname, 'data/lennaBase64.json'))).data, 'base64');
    gotBase64Buf = Buffer.from(JSON.parse(fs.readFileSync(path.join(__dirname, 'data/gotBase64.json'))).data, 'base64');
  });

  // TODO: setup opencv on travis with codecs correctly
  if (!process.env.DOCKER_BUILD && !process.env.BINDINGS_DEBUG) {
    videoCaptureTests();
    videoWriterTests();
  }

  describe('imread', () => {
    const flags = cv.IMREAD_UNCHANGED;
    generateAPITests({
      getDut: () => cv,
      methodName: 'imread',
      getRequiredArgs: () => ([
        getTestImagePath()
      ]),
      getOptionalArgs: () => ([
        flags
      ]),
      expectOutput: (img) => {
        expect(img).to.be.instanceOf(cv.Mat);
        assertMetaData(img)(512, 512, cv.CV_8UC3);
      }
    });
  });

  describe('imwrite', () => {
    const file = getTmpDataFilePath('written_sync.png');
    const flags = [cv.IMWRITE_PNG_COMPRESSION];
    generateAPITests({
      beforeHook: () => { clearTmpData(); },
      afterHook: () => { clearTmpData(); },
      getDut: () => cv,
      methodName: 'imwrite',
      getRequiredArgs: () => ([
        file,
        lenna
      ]),
      getOptionalArgs: () => ([
        flags
      ]),
      expectOutput: () => {
        expect(fileExists(file)).to.be.true;
      }
    });
  });

  describe('imencode', () => {
    describe('png', () => {
      const pngPrefixLength = 18;

      const ext = '.png';
      const flags = [cv.IMWRITE_PNG_COMPRESSION];
      generateAPITests({
        getDut: () => cv,
        methodName: 'imencode',
        getRequiredArgs: () => ([
          ext,
          lenna
        ]),
        getOptionalArgs: () => ([
          flags
        ]),
        expectOutput: (enc) => {
          expect(enc.slice(0, pngPrefixLength)).to.deep.equal(getLennaBase64Buf().slice(0, pngPrefixLength));
        }
      });
    });

    describe('jpg', () => {
      const jpgPrefixLength = 12;

      const ext = '.jpg';
      const flags = [cv.IMWRITE_JPEG_QUALITY];
      generateAPITests({
        getDut: () => cv,
        methodName: 'imencode',
        getRequiredArgs: () => ([
          ext,
          got
        ]),
        getOptionalArgs: () => ([
          flags
        ]),
        expectOutput: (enc) => {
          expect(enc.slice(0, jpgPrefixLength)).to.deep.equal(getGotBase64Buf().slice(0, jpgPrefixLength));
        }
      });
    });
  });

  describe('imdecode', () => {
    describe('sync', () => {
      funcShouldRequireArgs(cv.imdecode);

      it('should decode png', () => {
        const dec = cv.imdecode(getLennaBase64Buf());
        assertDataDeepEquals(lenna.getDataAsArray(), dec.getDataAsArray());
      });

      it('should decode jpeg', () => {
        const dec = cv.imdecode(getGotBase64Buf());
        assertDataDeepEquals(got.getDataAsArray(), dec.getDataAsArray());
      });
    });

    describe('async', () => {
      _asyncFuncShouldRequireArgs(cv.imdecodeAsync);

      it('should decode png', (done) => {
        cv.imdecodeAsync(getLennaBase64Buf(), (err, dec) => {
          assertDataDeepEquals(lenna.getDataAsArray(), dec.getDataAsArray());
          done();
        });
      });

      it('should decode jpeg', (done) => {
        cv.imdecodeAsync(getGotBase64Buf(), (err, dec) => {
          assertDataDeepEquals(got.getDataAsArray(), dec.getDataAsArray());
          done();
        });
      });
    });
  });
});
