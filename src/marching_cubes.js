const THREE = require('three');

import Metaball from './metaball.js';
import InspectPoint from './inspect_point.js'
import LUT from './marching_cube_LUT.js';
var VISUAL_DEBUG = true;

const LAMBERT_WHITE = new THREE.MeshLambertMaterial({ color: 0xeeeeee });
const LAMBERT_GREEN = new THREE.MeshBasicMaterial( { color: 0x00ee00, transparent: true, opacity: 0.5 });
const WIREFRAME_MAT = new THREE.LineBasicMaterial( { color: 0xffffff, linewidth: 10 } );


export default class MarchingCubes {

  constructor(App) {
    this.init(App);
  }

  init(App) {
    this.isPaused = false;
    VISUAL_DEBUG = App.config.visualDebug;

    // Initializing member variables.
    // Additional variables are used for fast computation.
    this.origin = new THREE.Vector3(0);

    this.isolevel = App.config.isolevel;
    this.minRadius = App.config.minRadius;
    this.maxRadius = App.config.maxRadius;

    this.gridCellWidth = App.config.gridCellWidth;
    this.halfCellWidth = App.config.gridCellWidth / 2.0;
    this.gridWidth = App.config.gridWidth;

    this.res = App.config.gridRes;
    this.res2 = App.config.gridRes * App.config.gridRes;
    this.res3 = App.config.gridRes * App.config.gridRes * App.config.gridRes;

    this.maxSpeed = App.config.maxSpeed;
    this.numMetaballs = App.config.numMetaballs;

    this.camera = App.camera;
    this.scene = App.scene;

    this.voxels = [];
    this.labels = [];
    this.balls = [];

    this.showSpheres = true;
    this.showGrid = true;

    if (App.config.material) {
      this.material = new THREE.MeshPhongMaterial({ color: 0xff6a1d});
    } else {
      this.material = App.config.material;
    }

    this.setupCells();
    this.setupMetaballs();
    this.makeMesh();
  };

  // Convert from 1D index to 3D indices
  i1toi3(i1) {

    // [i % w, i % (h * w)) / w, i / (h * w)]

    // @note: ~~ is a fast substitute for Math.floor()
    return [
      i1 % this.res,
      ~~ ((i1 % this.res2) / this.res),
      ~~ (i1 / this.res2)
      ];
  };

  // Convert from 3D indices to 1 1D
  i3toi1(i3x, i3y, i3z) {

    // [x + y * w + z * w * h]

    return i3x + i3y * this.res + i3z * this.res2;
  };

  // Convert from 3D indices to 3D positions
  i3toPos(i3) {

    return new THREE.Vector3(
      i3[0] * this.gridCellWidth + this.origin.x + this.halfCellWidth,
      i3[1] * this.gridCellWidth + this.origin.y + this.halfCellWidth,
      i3[2] * this.gridCellWidth + this.origin.z + this.halfCellWidth
      );
  };

  setupCells() {

    // Allocate voxels based on our grid resolution
    this.voxels = [];
    for (var i = 0; i < this.res3; i++) {
      var i3 = this.i1toi3(i);
      var {x, y, z} = this.i3toPos(i3);
      var voxel = new Voxel(new THREE.Vector3(x, y, z), this.gridCellWidth);
      this.voxels.push(voxel);

      if (VISUAL_DEBUG) {
        this.scene.add(voxel.wireframe);
        this.scene.add(voxel.mesh);
      }
    }
  }

  setupMetaballs() {

    this.balls = [];

    var x, y, z, vx, vy, vz, radius, pos, vel;
    var matLambertWhite = LAMBERT_WHITE;
    var maxRadiusTRippled = this.maxRadius * 3;
    var maxRadiusDoubled = this.maxRadius * 2;

    // Randomly generate metaballs with different sizes and velocities
    for (var i = 0; i < this.numMetaballs; i++) {
      x = this.gridWidth / 2;
      y = this.gridWidth / 2;
      z = this.gridWidth / 2;
      pos = new THREE.Vector3(x, y, z);

      vx = (Math.random() * 2 - 1) * this.maxSpeed;
      vy = (Math.random() * 2 - 1) * this.maxSpeed;
      vz = (Math.random() * 2 - 1) * this.maxSpeed;
      vel = new THREE.Vector3(vx, vy, vz);

      radius = Math.random() * (this.maxRadius - this.minRadius) + this.minRadius;

      var ball = new Metaball(pos, radius, vel, this.gridWidth, VISUAL_DEBUG);
      this.balls.push(ball);

      if (VISUAL_DEBUG) {
        this.scene.add(ball.mesh);
      }
    }
  }

  // This function samples a point from the metaball's density function
  // Implement a function that returns the value of the all metaballs influence to a given point.
  // Please follow the resources given in the write-up for details.
  sample(point) {
    // @TODO
    // var isovalue = 1.1;
    var isovalue = 0;
    for (var i = 0; i < this.numMetaballs; i++) {
      var ball = this.balls[i];
      var dx = Math.pow(ball.pos.x - point.x, 2);
      var dy = Math.pow(ball.pos.y - point.y, 2);
      var dz = Math.pow(ball.pos.z - point.x, 2);
      isovalue += ball.radius2 / (dx + dy + dz);
    }
    return isovalue;
  }

  update() {

    if (this.isPaused) {
      return;
    }

    // This should move the metaballs
    this.balls.forEach(function(ball) {
      ball.update();
    });

    for (var c = 0; c < this.res3; c++) {
      // Sampling the center point
      this.voxels[c].center.isovalue = this.sample(this.voxels[c].center.pos);
      // Sample voxel verts
      for (var i = 0; i < 8; i++) {
        this.voxels[c].sampleList[i] = this.sample(this.voxels[c].vertexList[i]);
      }

      // Visualizing grid
      if (VISUAL_DEBUG && this.showGrid) {

        // Toggle voxels on or off
        if (this.voxels[c].center.isovalue > this.isolevel) {
          this.voxels[c].show();
        } else {
          this.voxels[c].hide();
        }
        this.voxels[c].center.updateLabel(this.camera);
      } else {
        this.voxels[c].center.clearLabel();
      }
    }

    this.updateMesh();
  }

  pause() {
    this.isPaused = true;
  }

  play() {
    this.isPaused = false;
  }

  show() {
    for (var i = 0; i < this.res3; i++) {
      this.voxels[i].show();
    }
    this.showGrid = true;
  };

  hide() {
    for (var i = 0; i < this.res3; i++) {
      this.voxels[i].hide();
    }
    this.showGrid = false;
  };

  makeMesh() {
    // @TODO

  }

  updateMesh() {
    // @TODO
    for (var i = 0; i < this.res3; i++) {
      this.voxels[i].polygonize(1);
    }
  }
};

// ------------------------------------------- //

class Voxel {

  constructor(position, gridCellWidth) {
    this.init(position, gridCellWidth);
  }

  init(position, gridCellWidth) {
    this.pos = position;
    this.gridCellWidth = gridCellWidth;

    if (VISUAL_DEBUG) {
      this.makeMesh();
    }

    this.makeInspectPoints();
  }

  makeMesh() {
    var halfGridCellWidth = this.gridCellWidth / 2.0;

    var positions = new Float32Array([
      // Front face
       halfGridCellWidth, halfGridCellWidth,  halfGridCellWidth,
       halfGridCellWidth, -halfGridCellWidth, halfGridCellWidth,
      -halfGridCellWidth, -halfGridCellWidth, halfGridCellWidth,
      -halfGridCellWidth, halfGridCellWidth,  halfGridCellWidth,

      // Back face
      -halfGridCellWidth,  halfGridCellWidth, -halfGridCellWidth,
      -halfGridCellWidth, -halfGridCellWidth, -halfGridCellWidth,
       halfGridCellWidth, -halfGridCellWidth, -halfGridCellWidth,
       halfGridCellWidth,  halfGridCellWidth, -halfGridCellWidth,
    ]);

    var indices = new Uint16Array([
      0, 1, 2, 3,
      4, 5, 6, 7,
      0, 7, 7, 4,
      4, 3, 3, 0,
      1, 6, 6, 5,
      5, 2, 2, 1
    ]);

    // Buffer geometry
    var geo = new THREE.BufferGeometry();
    geo.setIndex( new THREE.BufferAttribute( indices, 1 ) );
    geo.addAttribute( 'position', new THREE.BufferAttribute( positions, 3 ) );

    // Wireframe line segments
    this.wireframe = new THREE.LineSegments( geo, WIREFRAME_MAT );
    this.wireframe.position.set(this.pos.x, this.pos.y, this.pos.z);

    // Green cube
    geo = new THREE.BoxBufferGeometry(this.gridCellWidth, this.gridCellWidth, this.gridCellWidth);
    this.mesh = new THREE.Mesh( geo, LAMBERT_GREEN );
    this.mesh.position.set(this.pos.x, this.pos.y, this.pos.z);


    // Setup vertexList, sampleList, edgeList
    var w = this.gridCellWidth / 2;
    // Back
    var v0 = new THREE.Vector3(this.pos.x - w, this.pos.y - w, this.pos.z - w);
    var v1 = new THREE.Vector3(this.pos.x + w, this.pos.y - w, this.pos.z - w);
    var v5 = new THREE.Vector3(this.pos.x + w, this.pos.y + w, this.pos.z = w);
    var v4 = new THREE.Vector3(this.pos.x - w, this.pos.y + w, this.pos.z - w);
    // Front
    var v3 = new THREE.Vector3(this.pos.x - w, this.pos.y - w, this.pos.z + w);
    var v2 = new THREE.Vector3(this.pos.x + w, this.pos.y - w, this.pos.z + w);
    var v6 = new THREE.Vector3(this.pos.x + w, this.pos.y + w, this.pos.z + w);
    var v7 = new THREE.Vector3(this.pos.x - w, this.pos.y + w, this.pos.z + w);

    this.vertexList = [v0, v1, v2, v3, v4, v5, v6, v7];
    this.sampleList = [0, 0, 0, 0, 0, 0, 0, 0];

    var e0 = [0, 1];
    var e1 = [1, 2];
    var e2 = [2, 3];
    var e3 = [3, 0];
    var e4 = [4, 5];
    var e5 = [5, 6];
    var e6 = [6, 7];
    var e7 = [7, 4];
    var e8 = [0, 4];
    var e9 = [1, 5];
    var e10 = [2, 6];
    var e11 = [3, 7];
    this.edgeList = [e0, e1, e2, e3, e4, e5, e6, e7, e8, e9, e10, e11];
  }

  makeInspectPoints() {
    var halfGridCellWidth = this.gridCellWidth / 2.0;
    var x = this.pos.x;
    var y = this.pos.y;
    var z = this.pos.z;
    var red = 0xff0000;

    // Center dot
    this.center = new InspectPoint(new THREE.Vector3(x, y, z), 0, VISUAL_DEBUG);
  }

  show() {
    if (this.mesh) {
      this.mesh.visible = true;
    }
    if (this.wireframe) {
      this.wireframe.visible = true;
    }
  }

  hide() {
    if (this.mesh) {
      this.mesh.visible = false;
    }

    if (this.wireframe) {
      this.wireframe.visible = false;
    }

    if (this.center) {
      this.center.clearLabel();
    }
  }

  vertexInterpolation(isolevel, vertA, vertB) {
    // @TODO
    // Sample values
    var s0 = this.sampleList[vertA];
    var s1 = this.sampleList[vertB];
    // Positions
    var p0 = this.vertexList[vertA];
    var p1 = this.vertexList[vertB];
    var diff = new THREE.Vector3(p1.x - p0.x, p1.y - p0.y, p1.z - p0.z);

    var lerpPos = new THREE.Vector3(
        p0.x + (isolevel - s0) * diff.x/ (s1 - s0),
        p0.y + (isolevel - s0) * diff.y/ (s1 - s0),
        p0.z + (isolevel - s0) * diff.z/ (s1 - s0));

    return lerpPos;
  }

  polygonize(isolevel) {

    // @TODO
    var vertPositions = [];
    var vertNormals = [];

    var cubeindex = 0; // 8-bit number - which verts are intersected
    for (var i = 0; i < 8; i++) {
      var samp = this.sampleList[i];
      cubeindex = (cubeindex << 1) | (samp > isolevel);
    }

    var edges = LUT.EDGE_TABLE[cubeindex];
    var interpPositions = [-1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1];
    for (var i = 0; i < 12; i++) {
      var bit = Math.pow(2, i);
      if ((edges & bit)) { // If edge i is intersected
        var v0 = this.edgeList[i][0];
        var v1 = this.edgeList[i][1];
        var pos = this.vertexInterpolation(isolevel, v0, v1);
        interpPositions[i] = pos;
      }
    }

    var tris = [];
    for (var i = cubeindex * 16; i < cubeindex * 16 + 16; i++) {
      tris.push(LUT.TRI_TABLE[i]);
    }

    for (var i = 0; i < 13; i+=3) {
      if (tris[i] != -1) {
        vertPositions.push(interpPositions[tris[i]]);
        vertPositions.push(interpPositions[tris[i + 1]]);
        vertPositions.push(interpPositions[tris[i + 2]]);
      }
    }

    return {
      vertPositions: vertPositions,
      vertNormals: vertNormals
    };
  };
}
