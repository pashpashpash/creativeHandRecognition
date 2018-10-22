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
const white = new cv.Vec(255, 255, 255);
const purple= new cv.Vec(96, 76, 141);

const defaultVideo = "../data/hand-gesture.mp4";
const myVideo = "../data/IMG_2286.mp4";
const myVideo2 = "../data/IMG_2310.mp4";
const myVideo3 = "../data/IMG_2310_cut.mp4";


// main
const delay = 2;
grabFrames(defaultVideo, delay, (frame) => { //for each frame
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

    let result = resizedImg.copy();


    // draw points and vertices
    // verticesWithValidAngle.forEach((v) => {
    //   result.drawEllipse(
    //     new cv.RotatedRect(v.pt, new cv.Size(1, 1), 0),
    //     { color: white, thickness: 1 }
    //   );
    // });

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
    var finalResult = result;

    //set a blank overlay for use in multi-layer animation functions
    let overlay = new cv.Mat(rows, cols, cv.CV_8UC3);

    drawWhiteLines(result, fingerCount, finger1, finger2, finger3, finger4, finger5);
    // result = drawPurpleLines(result, overlay, fingerCount, verticesWithValidAngle);
    // result = drawPurpleLines_Negative(result, overlay, fingerCount, verticesWithValidAngle);
    // drawHandContour(result, handContour);
    // result = drawBlurredHandContour(result, overlay, handContour);

    // result = drawWord(result, overlay, fingerCount, finger1, finger2, finger3, finger4, finger5); //still need to finish


    if(result != null) { //this checks for flashing frames by checking for bright pixels. If bright pixels don't exist, show the frame.
        cv.imshow('Design IV Proof of Concept', result);
    }
});

function drawHandContour(result, handContour) {
    if(result!=null) {
        result.drawContours(
          [handContour],
          white,
          { thickness: 1 },
        );
    }

}
function drawBlurredHandContour(result, overlay, handContour) {
    overlay.drawContours(
      [handContour],
      white,
      { thickness: 1 },
    );
    let ksize = new cv.Size(3, 10);
    let overlaytemp = overlay;
    overlay = overlay.blur(ksize);
    overlay = overlay.add(overlaytemp);

    if(result != null) {
        result = result.addWeighted( -1,overlay,  4, 4);
        if(result.at(0) !=null) {
            if(result.at(0).at(0) > 250) { //skip frame if its all white
                result = null;
            } else if (result.at(1).at(1) > 250) {
                result = null;
            } else {
                return result;
            }
        }
    }
    return  result;
}


function drawWhiteLines(result, fingerCount, finger1, finger2, finger3, finger4, finger5) {
    if(finger1 != null && finger2 != null){
        console.log(fingerCount + " FINGERS PRESENT");
        result.drawLine(
          finger1,
          finger2,
          { color: white}
        );
        if(finger3!= null ){
            result.drawLine(
              finger1,
              finger3,
              { color: white}
            );
            result.drawLine(
              finger2,
              finger3,
              { color: white}
            );
            if(finger4!=null) {
                result.drawLine(
                  finger3,
                  finger4,
                  { color: white}
                );
                result.drawLine(
                  finger2,
                  finger4,
                  { color: white}
                );
                result.drawLine(
                  finger1,
                  finger4,
                  { color: white}
                );
                if(finger5!=null) {
                    result.drawLine(
                      finger4,
                      finger5,
                      { color: white}
                    );
                    result.drawLine(
                      finger3,
                      finger5,
                      { color: white}
                    );
                    result.drawLine(
                      finger2,
                      finger5,
                      { color: white}
                    );
                    result.drawLine(
                      finger1,
                      finger5,
                      { color: white}
                    );
                }
            }
        }
    }
}
function drawWord(result, overlay, fingerCount, finger1, finger2, finger3, finger4, finger5) {
    // var overlay = new cv.Mat(rows, cols, cv.CV_8UC3);
    if(finger1 != null && finger2 != null){
        console.log(fingerCount + " FINGERS PRESENT");
        let ksize = new cv.Size(1, 10);
        let overlaytemp = overlay;
        console.log(finger1.x);
        overlay.putText(
          String("test"),
          finger1,
          cv.FONT_ITALIC,
          2,
          { color: white, thickness: 2 }
        );

        let dsize = new cv.Size(overlay.cols, overlay.rows);
        let center = new cv.Point(overlay.cols / 2, overlay.rows / 2);
        // You can try more different parameters
        let M = cv.getRotationMatrix2D(center, 45, 0.5);
        let vec = new cv.Vec3(0, 0, 0);
        overlay = overlay.warpAffine(M, dsize, cv.INTER_LINEAR, cv.BORDER_CONSTANT,  vec);
        // overlay = overlay.blur(ksize);
        // overlay = overlay.add(overlaytemp);
        if(result != null) {
            result = result.addWeighted( 1,overlay,  4, 1);
            // if(result.at(0) !=null) {
            //     if(result.at(0).at(0) > 250) { //skip frame if its all white
            //         result = null;
            //     } else if (result.at(1).at(1) > 250) {
            //         result = null;
            //     } else {
            //         return result;
            //     }
            // }
        }
        return (result);
    }
}

function drawPurpleLines(result, overlay, fingerCount, verticesWithValidAngle) {
    let random = Math.floor(Math.random() * 10); //random int from 0-9
    let random2 = Math.floor(Math.random() * 100); //random int from 0-9
    let purple2= new cv.Vec(96+random2, 76+random2, 141+random2);

    verticesWithValidAngle.forEach((v, i) => {
        let fingerPoint = v.pt;
        let index = i;
        for (var s = index+1; s < verticesWithValidAngle.length; s++) {
            fingerPoint2 = verticesWithValidAngle[s].pt;
            if(!(fingerPoint.y> result.rows/2*1.2) && !(fingerPoint2.y>result.rows/2*1.2)) {
                overlay.drawLine(
                  fingerPoint,
                  fingerPoint2,
                  { color: purple2}
                );
            }
        }
    });



    let ksize = new cv.Size(10+random , 10);
    let overlaytemp = overlay;


    overlay = overlay.blur(ksize);
    overlay = overlay.add(overlaytemp);
    // console.log(overlay.at(0).at(0));

    // overlay = overlay.add(overlay);


    if(result != null) {

        result = result.addWeighted( 1,overlay,  4+random, 1);
        if(result.at(0) !=null) {
            if(result.at(0).at(0) > 250) { //skip frame if its all white
                result = null;
            } else if (result.at(1).at(1) > 250) {
                result = null;
            } else {
                return result;
            }
        }
    }
    return result;

}
function drawPurpleLines_Negative(result, overlay, fingerCount, verticesWithValidAngle) {
    let random = Math.floor(Math.random() * 10); //random int from 0-9
    let random2 = Math.floor(Math.random() * 100); //random int from 0-9
    let purple2= new cv.Vec(96+random2, 76+random2, 141+random2);

    verticesWithValidAngle.forEach((v, i) => {
        let fingerPoint = v.pt;
        let index = i;
        for (var s = index+1; s < verticesWithValidAngle.length; s++) {
            fingerPoint2 = verticesWithValidAngle[s].pt;
            if(!(fingerPoint.y> result.rows/2*1.2) && !(fingerPoint2.y>result.rows/2*1.2)) {
                overlay.drawLine(
                  fingerPoint,
                  fingerPoint2,
                  { color: purple2}
                );
            }
        }
    });



    let ksize = new cv.Size(10+random , 10);
    let overlaytemp = overlay;


    overlay = overlay.blur(ksize);
    overlay = overlay.add(overlaytemp);
    // console.log(overlay.at(0).at(0));

    // overlay = overlay.add(overlay);


    if(result != null) {

        result = result.addWeighted( -1,overlay,  4+random, 1);
        if(result.at(0) !=null) {
            if(result.at(0).at(0) > 250) { //skip frame if its all white
                result = null;
            } else if (result.at(1).at(1) > 250) {
                result = null;
            } else {
                return result;
            }
        }
    }
    return result;

}
