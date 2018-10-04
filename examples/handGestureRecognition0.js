const cv = require('../');
const { grabFrames } = require('./utils');

// segmenting by skin color (has to be adjusted)
const skinColorUpper = hue => new cv.Vec(hue, 0.8 * 255, 0.6 * 255);
const skinColorLower = hue => new cv.Vec(hue, 0.1 * 255, 0.05 * 255);

const makeHandMask = (img) => {
  // filter by skin color
  const imgHLS = img.cvtColor(cv.COLOR_BGR2HLS);
  const rangeMask = imgHLS.inRange(skinColorLower(0), skinColorUpper(15));

  // remove noise
  const blurred = rangeMask.blur(new cv.Size(10, 10));
  const thresholded = blurred.threshold(200, 255, cv.THRESH_BINARY);

  return thresholded;
};

const getHandContour = (handMask) => {
  const mode = cv.RETR_EXTERNAL;
  const method = cv.CHAIN_APPROX_SIMPLE;
  const contours = handMask.findContours(mode, method);
  // largest contour
  return contours.sort((c0, c1) => c1.area - c0.area)[0];
};

// returns distance of two points
const ptDist = (pt1, pt2) => pt1.sub(pt2).norm();

// returns center of all points
const getCenterPt = pts => pts.reduce(
    (sum, pt) => sum.add(pt),
    new cv.Point(0, 0)
  ).div(pts.length);

// get the polygon from a contours hull such that there
// will be only a single hull point for a local neighborhood
const getRoughHull = (contour, maxDist) => {
  // get hull indices and hull points
  const hullIndices = contour.convexHullIndices();
  const contourPoints = contour.getPoints();
  const hullPointsWithIdx = hullIndices.map(idx => ({
    pt: contourPoints[idx],
    contourIdx: idx
  }));
  const hullPoints = hullPointsWithIdx.map(ptWithIdx => ptWithIdx.pt);

  // group all points in local neighborhood
  const ptsBelongToSameCluster = (pt1, pt2) => ptDist(pt1, pt2) < maxDist;
  const { labels } = cv.partition(hullPoints, ptsBelongToSameCluster);
  const pointsByLabel = new Map();
  labels.forEach(l => pointsByLabel.set(l, []));
  hullPointsWithIdx.forEach((ptWithIdx, i) => {
    const label = labels[i];
    pointsByLabel.get(label).push(ptWithIdx);
  });

  // map points in local neighborhood to most central point
  const getMostCentralPoint = (pointGroup) => {
    // find center
    const center = getCenterPt(pointGroup.map(ptWithIdx => ptWithIdx.pt));
    // sort ascending by distance to center
    return pointGroup.sort(
      (ptWithIdx1, ptWithIdx2) => ptDist(ptWithIdx1.pt, center) - ptDist(ptWithIdx2.pt, center)
    )[0];
  };
  const pointGroups = Array.from(pointsByLabel.values());
  // return contour indeces of most central points
  return pointGroups.map(getMostCentralPoint).map(ptWithIdx => ptWithIdx.contourIdx);
};

const getHullDefectVertices = (handContour, hullIndices) => {
  const defects = handContour.convexityDefects(hullIndices);
  const handContourPoints = handContour.getPoints();

  // get neighbor defect points of each hull point
  const hullPointDefectNeighbors = new Map(hullIndices.map(idx => [idx, []]));
  defects.forEach((defect) => {
    const startPointIdx = defect.at(0);
    const endPointIdx = defect.at(1);
    const defectPointIdx = defect.at(2);
    hullPointDefectNeighbors.get(startPointIdx).push(defectPointIdx);
    hullPointDefectNeighbors.get(endPointIdx).push(defectPointIdx);
  });

  return Array.from(hullPointDefectNeighbors.keys())
    // only consider hull points that have 2 neighbor defects
    .filter(hullIndex => hullPointDefectNeighbors.get(hullIndex).length > 1)
    // return vertex points
    .map((hullIndex) => {
      const defectNeighborsIdx = hullPointDefectNeighbors.get(hullIndex);
      return ({
        pt: handContourPoints[hullIndex],
        d1: handContourPoints[defectNeighborsIdx[0]],
        d2: handContourPoints[defectNeighborsIdx[1]]
      });
    });
};

const filterVerticesByAngle = (vertices, maxAngleDeg) =>
  vertices.filter((v) => {
    const sq = x => x * x;
    const a = v.d1.sub(v.d2).norm();
    const b = v.pt.sub(v.d1).norm();
    const c = v.pt.sub(v.d2).norm();
    const angleDeg = Math.acos(((sq(b) + sq(c)) - sq(a)) / (2 * b * c)) * (180 / Math.PI);
    return angleDeg < maxAngleDeg;
  });

const blue = new cv.Vec(255, 0, 0);
const green = new cv.Vec(0, 255, 0);
const red = new cv.Vec(0, 0, 255);
const purple = new cv.Vec(255, 255, 255);

// main
const delay = 60;
grabFrames('../data/hand-gesture.mp4', delay, (frame) => { //for each frame
  const resizedImg = frame.resizeToMax(640);

  const handMask = makeHandMask(resizedImg);
  const handContour = getHandContour(handMask);
  if (!handContour) {
    return;
  }

  const maxPointDist = 25;
  const hullIndices = getRoughHull(handContour, maxPointDist);

  // get defect points of hull to contour and return vertices
  // of each hull point to its defect points
  const vertices = getHullDefectVertices(handContour, hullIndices);

  // fingertip points are those which have a sharp angle to its defect points
  const maxAngleDeg = 60;
  const verticesWithValidAngle = filterVerticesByAngle(vertices, maxAngleDeg);

  const result = resizedImg.copy();
  // draw bounding box and center line
  resizedImg.drawContours(
    [handContour],
    red,
    { thickness: 2 }
  );

  // draw points and vertices
  verticesWithValidAngle.forEach((v) => {
    resizedImg.drawLine(
      v.pt,
      v.d1,
      { color: red, thickness: 2 }
    );
    resizedImg.drawLine(
      v.pt,
      v.d2,
      { color: purple, thickness: 2 }
    );
    resizedImg.drawEllipse(
      new cv.RotatedRect(v.pt, new cv.Size(1, 1), 0),
      { color: purple, thickness: 2 }
    );
    result.drawEllipse(
      new cv.RotatedRect(v.pt, new cv.Size(1, 1), 0),
      { color: purple, thickness: 2 }
    );
  });

    //_________________________________________________________________________________//
    // draw lines between the CIRCLES verticesWithValidAngle[0]-[4] are the 5 fingers
    var finger1 = null;
    var finger2 = null;
    var finger3 = null;
    var finger4 = null;
    var finger5 = null;
    console.log("_______________________________________");
    var fingerCount = 0;
    if(verticesWithValidAngle[0] != null) {

        finger1 =  verticesWithValidAngle[0].pt;
        fingerCount++;
        console.log("Finger 1 | x : "+finger1.x + "  y : " + finger1.y);
    }
    if(verticesWithValidAngle[1] != null) {

        finger2 = verticesWithValidAngle[1].pt;
        fingerCount++;
        console.log("Finger 2 | x : "+finger2.x + "  y : " + finger2.y);
    }
    if(verticesWithValidAngle[2] != null) {

        finger3 = verticesWithValidAngle[2].pt;
        fingerCount++;
        console.log("Finger 3 | x : "+finger3.x + "  y : " + finger3.y);
    }
    if(verticesWithValidAngle[3] != null) {
        finger4 = verticesWithValidAngle[3].pt;
        fingerCount++;
        console.log("Finger 4 | x : "+finger4.x + "  y : " + finger4.y);
    }
    if(verticesWithValidAngle[4] != null) {
        finger5 = verticesWithValidAngle[4].pt;
        fingerCount++;
        console.log("Finger 5 | x : "+finger5.x + "  y : " + finger5.y);
    }
    const { rows, cols } = result;
    var tempMat = new cv.Mat (rows, cols, cv.CV_8UC3);
    if(finger1 != null && finger2 != null){
        console.log(fingerCount + " FINGERS PRESENT");
        // result.drawRectangle(
        //   finger1,
        //   finger2,
        //   { color: purple, thickness: 1}
        // );
        // result.drawLine(
        //   finger1,
        //   finger2,
        //   { color: purple}
        // );
        var width = abs(finger1.x - finger2.x);
        var height = abs(finger1.y - finger2.y);
        tempMat = new cv.Mat (width, height, cv.CV_8UC3);
        tempMat.drawLine(
            new cv.Point(0, 0),
            new cv.Point(70, 70),
              { color: purple, thickness: 1}
          );
        result.putText(
          String("hello"),
          finger1,
          cv.FONT_ITALIC,
          2,
          { color: purple, thickness: 2 }
        );
        tempMat.drawRectangle(
              finger1,
              finger2,
              { color: purple, thickness: 1}
          );
    }
    console.log(fingerCount + " FINGERS PRESENT");


  // display detection result
  const numFingersUp = verticesWithValidAngle.length;
  result.drawRectangle(
    new cv.Point(10, 10),
    new cv.Point(70, 70),
    { color: green, thickness: 2 }
  );

  const fontScale = 2;
  result.putText(
    String(numFingersUp),
    new cv.Point(20, 60),
    cv.FONT_ITALIC,
    fontScale,
    { color: green, thickness: 2 }
  );


  const sideBySide = new cv.Mat(rows, cols * 2, cv.CV_8UC3);


    tempMat.copyTo(result);
  cv.imshow('result', result);

  // result.copyTo(sideBySide.getRegion(new cv.Rect(0, 0, cols, rows)));
  // resizedImg.copyTo(sideBySide.getRegion(new cv.Rect(cols, 0, cols, rows)));

  // cv.imshow('handMask', handMask);
  // cv.imshow('result', sideBySide);
});
