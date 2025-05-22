import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { MTLLoader } from 'three/examples/jsm/loaders/MTLLoader.js';
import { OBJLoader } from 'three/examples/jsm/loaders/OBJLoader.js';

let panda; // 用于引用加载后的模型
let jumpClock = new THREE.Clock();
let pedestrianClock = new THREE.Clock();
const obstacles = [];

const scene = new THREE.Scene();
scene.background = new THREE.Color(0xdddddd);

const camera = new THREE.PerspectiveCamera(
75,
window.innerWidth / window.innerHeight,
0.1,
1000
);
camera.position.set(0, 5, 15); // 相机远离模型正面

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap; 
document.body.appendChild(renderer.domElement);

const controls = new OrbitControls(camera, renderer.domElement);
controls.target.set(0, 5, 0); // 设置观察中心点为模型中间
controls.update();

const dirLight = new THREE.DirectionalLight(0xffffff, 0.4);
dirLight.position.set(10, 20, 10); 
scene.add(dirLight);
dirLight.castShadow = true;

const ambientLight = new THREE.AmbientLight(0x404040);
scene.add(ambientLight);

const mtlLoader = new MTLLoader();
mtlLoader.setPath('./');
mtlLoader.load('panda.mtl', (materials) => {
  materials.preload();

  const objLoader = new OBJLoader();
  objLoader.setMaterials(materials);
  objLoader.setPath('./');
  objLoader.load('panda.obj', (object) => {
    object.scale.set(2, 2, 2);
    object.rotation.y = -Math.PI / 2;
    object.position.y = -1.95;
    object.traverse((child) => {
      if (child.isMesh) {
        child.castShadow = true; // 让 panda 投射阴影
      }
    });
    scene.add(object);
    obstacles.push(object);
    panda = object; // 保存引用

  });
});



// create ground Ground position -2; ground size 40, 40
function createGround() {
  
  const planeGeometry = new THREE.PlaneGeometry(40, 40);
  const planeMaterial = new THREE.MeshBasicMaterial({
    color: 0xffffff, // 纯白
    side: THREE.DoubleSide
  });

  const plane = new THREE.Mesh(planeGeometry, planeMaterial);
  plane.rotation.x = -Math.PI / 2;
  plane.position.y = -1;  // 保证 GridHelper 在上面或微微抬高
  scene.add(plane);
  plane.receiveShadow = true;

  // 创建灰色网格线
  const gridHelper = new THREE.GridHelper(40, 20, 0xaaaaaa, 0xaaaaaa); // 灰色线条
  gridHelper.position.y = -0.99; // 稍微抬高避免重叠闪烁
  scene.add(gridHelper);

}

createGround();

function createHuman() {
  const geometry = new THREE.SphereGeometry(0.3, 26, 26);
  const material = new THREE.MeshStandardMaterial({ color: 0x333333 });
  const mesh = new THREE.Mesh(geometry, material);
  scene.add(mesh);
  return mesh;
}

class Agent {
  constructor (position, velocity, goal) {
    this.position = position.clone();     // THREE.Vector3(x, 0, z)
    this.velocity = velocity.clone();     // THREE.Vector3(vx, 0, vz)
    this.goal = goal.clone();             // THREE.Vector3
    this.mesh = createHuman();      // Panda 模型（或 Sphere）
    this.force = new THREE.Vector3();     // 三力之和
  }
}

//pedestrian simulation based on social force
//create two direction pedestrian
const agents = [];
const numAgents = 50;
const areaSize = 40;
const halfSize = areaSize / 2;
const desiredSpeed = 0.5;

// 设置目标点
const goalRight = new THREE.Vector3(halfSize, 0, 0);   // x = +20
const goalLeft = new THREE.Vector3(-halfSize, 0, 0);   // x = -20



//put agent into the function.
for (let i = 0; i < numAgents / 2; i++) {
  // 👈 从左往右的人，出生在 x ∈ [-20, -12]
  const startLeft = new THREE.Vector3(
    -halfSize + Math.random() * (areaSize * 0.2), // -20 ~ -12
    0,
    -halfSize + Math.random() * areaSize           // z: -20 ~ 20
  );
  const agentL = new Agent(startLeft, new THREE.Vector3(desiredSpeed, 0, 0), goalRight);
  agentL.mesh.material.color.set(0xff0000); // 红色
  agents.push(agentL);
  scene.add(agentL.mesh);

  // 👉 从右往左的人，出生在 x ∈ [12, 20]
  const startRight = new THREE.Vector3(
    halfSize - Math.random() * (areaSize * 0.2),  // 20 ~ 12
    0,
    -halfSize + Math.random() * areaSize          // z: -20 ~ 20
  );
  const agentR = new Agent(startRight, new THREE.Vector3(-desiredSpeed, 0, 0), goalLeft);
  agentR.mesh.material.color.set(0x0000ff); // 蓝色
  agents.push(agentR);
  scene.add(agentR.mesh);
}


const tau = 0.5;
//desired force
function computeDesiredForce(agent) {
  const desiredDir = agent.goal.clone().sub(agent.position).normalize();
  const desiredVel = desiredDir.multiplyScalar(desiredSpeed);
  const desiredForce = desiredVel.sub(agent.velocity).divideScalar(tau);
  return desiredForce;
}

const A = 50;     // 力强度（越高越容易“挤开”）
const R = 8;     // 距离阈值（在多少距离内开始产生斥力）

//social force push ppl away from each other
function computeSocialForce(agent, agents) {
  const force = new THREE.Vector3();
  for (let other of agents) {
    if (other === agent) continue;
    const dir = agent.position.clone().sub(other.position); // r1 - r2
    const dist = dir.length();
    if (dist < R && dist > 0.01) {
      // 可加角度限制：cos(theta) < cos(80°) ≈ 0.17
      const cosTheta = agent.velocity.clone().dot(dir) / (agent.velocity.length() * dir.length());
      if (cosTheta < 0.173648) {
        const f = A * Math.exp(-Math.pow(dist, 2) / Math.pow(R, 2));
        dir.normalize().multiplyScalar(f);
        force.add(dir);
      }
    }
  }
  return force;
}

// Obstacle force parameters
const B = 80;        // 斥力强度
const R_obs = 10;     // 障碍影响半径

//push ppl away from obstacles.
function computeObstacleForce(agent, obstacles) {
  const force = new THREE.Vector3();
  for (let obs of obstacles) {
    const dir = agent.position.clone().sub(obs);
    const dist = dir.length();
    if (dist < R_obs && dist > 0.01) {
      const f = B * Math.exp(-dist / R_obs);
      dir.normalize().multiplyScalar(f);
      force.add(dir);
    }
  }
  return force;
}


function updateAgent(agent, agents, obstacles, deltaTime) {
  const f_desired = computeDesiredForce(agent);
  const f_social = computeSocialForce(agent, agents);
  const f_obstacle = computeObstacleForce(agent, obstacles);

  // 合力
  const totalForce = new THREE.Vector3()
                          .add(f_desired)
                          .add(f_social)
                          .add(f_obstacle);
  agent.force.copy(totalForce);

  // 半步速度 Verlet 法则（≈你 Python 的 0.5h²）
  const acc = totalForce; // 假设质量 = 1
  agent.velocity.add(acc.clone().multiplyScalar(deltaTime / 2));
  agent.position.add(agent.velocity.clone().multiplyScalar(deltaTime));
  agent.velocity.add(acc.clone().multiplyScalar(deltaTime / 2));

  // 更新可视化位置
  agent.mesh.position.copy(agent.position);

  const x = agent.position.x;
  const z = agent.position.z;

  if (x < -19 || x > 19 || z < -19 || z > 19) {
    resetAgent(agent, 40);
  }

}

function resetAgent(agent, areaSize) {
  const desiredSpeed = 0.5;
  const halfSize = areaSize / 2; // = 20

  const goingRight = agent.velocity.x > 0;

  if (goingRight) {
    // 从左边区域重新生成：x ∈ [-20, -12]
    agent.position.set(
      -halfSize + Math.random() * (areaSize * 0.2),  // x: -20 ~ -12
      0,
      -halfSize + Math.random() * areaSize           // z: -20 ~ 20
    );
    agent.goal.set(halfSize, 0, 0); // 目标是 x = +20
    agent.velocity.set(desiredSpeed, 0, 0);
  } else {
    // 从右边区域重新生成：x ∈ [12, 20]
    agent.position.set(
      halfSize - Math.random() * (areaSize * 0.2),   // x: 20 ~ 12
      0,
      -halfSize + Math.random() * areaSize           // z: -20 ~ 20
    );
    agent.goal.set(-halfSize, 0, 0); // 目标是 x = -20
    agent.velocity.set(-desiredSpeed, 0, 0);
  }

  // 防止浮空
  agent.position.y = 0;
  agent.mesh.position.copy(agent.position);
}

 

function createWall(x, z, width, height) {
  const geometry = new THREE.BoxGeometry(width, 5, height);
  const material = new THREE.MeshStandardMaterial({ color: 0x888888 });
  const wall = new THREE.Mesh(geometry, material);
  wall.position.set(x, 2.5, z); // 提高一点点 y 让它浮起来
  scene.add(wall);
  return wall;
}

// destroy agent when out of ground



function animate() {
  requestAnimationFrame(animate);
  if (panda) {
    const t = jumpClock.getElapsedTime();
    panda.position.y = Math.abs(Math.sin(t * 2)) * 0.5; // 模拟跳动上下浮动
  }
  const deltaTime = pedestrianClock.getDelta();
  for (let agent of agents) {
    updateAgent(agent, agents, obstacles, deltaTime);
  }
  controls.update();
  renderer.render(scene, camera);
}

animate();