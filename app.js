const SITE_URL = "https://qqqzj-crane.github.io/web-all/";
const REPO_URL = "https://github.com/qqqzj-crane/web-all";

const crew = [
  {
    name: "qqqzj",
    handle: "主页成员",
    role: "成员 01",
    mark: "01",
    accent: "rgba(65, 145, 255, 0.45)",
    headline: "放个人简介、照片和项目入口。",
    quote: "这里放 qqqzj 的成员信息。",
    bio: "我是 qqqzj。这个页面是四个人一起用的主页。",
    focus: "主页信息、照片、项目",
    status: "个人信息",
    now: "这里放 qqqzj 的个人信息。",
    favorite: "项目入口、照片、资料整理",
    signal: 100,
    image: "assets/member-me.jpg",
    tags: ["qqqzj", "成员", "项目"],
    link: "#memory",
    action: "看相册",
    facts: [
      ["成员", "qqqzj"],
      ["仓库", "qqqzj-crane/web-all"],
      ["内容", "个人信息"],
    ],
  },
  {
    name: "l_l",
    handle: "日常和整理",
    role: "成员 02",
    mark: "02",
    accent: "rgba(93, 201, 163, 0.5)",
    headline: "放日常碎片、活动说明和照片备注。",
    quote: "这里可以放真实经历、短句和照片说明。",
    bio: "这里可以放短记录、活动说明、照片备注，或者想保留的小片段。",
    focus: "日常碎片、短文、照片说明",
    status: "个人信息",
    now: "这里放 l_l 的个人信息和日常碎片。",
    favorite: "活动记录、照片说明、短文",
    signal: 89,
    image: "assets/member-friend-c.jpg",
    tags: ["日常", "照片", "说明"],
    link: "#memory",
    action: "看相册",
    facts: [
      ["内容", "日常、照片备注"],
      ["可以放", "活动记录、短文"],
      ["类型", "成员信息"],
    ],
  },
  {
    name: "zzz",
    handle: "照片和素材",
    role: "负责照片",
    mark: "03",
    accent: "rgba(255, 116, 128, 0.45)",
    headline: "整理合照、活动图和封面图。",
    quote: "负责挑选照片和素材，后面可以把占位图换成真实图片。",
    bio: "这里可以放个人简介、喜欢的照片风格，或者相册分类。",
    focus: "照片、封面、配色",
    status: "个人信息",
    now: "负责相册内容和封面素材。",
    favorite: "合照、活动照、封面图",
    signal: 90,
    image: "assets/member-friend-a.jpg",
    tags: ["照片", "相册", "素材"],
    link: "#memory",
    action: "看相册",
    facts: [
      ["负责", "照片墙、封面图"],
      ["可以补", "合照、旅行照、活动照"],
      ["类型", "成员信息"],
    ],
  },
  {
    name: "Trae",
    handle: "项目和资料",
    role: "成员 04",
    mark: "04",
    accent: "rgba(255, 191, 71, 0.5)",
    headline: "放课程项目、资料链接和作品入口。",
    quote: "负责整理项目入口、常用资料和后续要补的内容。",
    bio: "这里可以放项目说明、仓库链接、展示视频，或者几条常用资料入口。",
    focus: "资料入口、项目列表、作品",
    status: "个人信息",
    now: "负责项目入口和资料链接。",
    favorite: "项目截图、文档链接、展示入口",
    signal: 93,
    image: "assets/member-friend-b.jpg",
    tags: ["项目", "资料", "作品"],
    link: "#collab",
    action: "看共建",
    facts: [
      ["负责", "项目入口、资料整理"],
      ["可以补", "项目链接、截图、说明"],
      ["类型", "成员信息"],
    ],
  },
];

const memories = [
  {
    label: "照片",
    title: "照片墙",
    text: "放合照、旅行照、活动照。每组照片配一句简单说明就够。",
    image: "assets/youth-memory-photos.svg",
  },
  {
    label: "项目",
    title: "项目与作品",
    text: "放课程项目、小工具或展示链接。每个项目保留标题、截图和链接。",
    image: "assets/youth-memory-project.svg",
  },
  {
    label: "记录",
    title: "日常记录",
    text: "放聚餐、活动、复习周、游戏截图等内容，简单记录就好。",
    image: "assets/youth-memory-daily.svg",
  },
];

const crewGrid = document.querySelector("#crew-grid");
const memberPanel = document.querySelector("#member-panel");
const memoryList = document.querySelector("#memory-list");
const motionToggle = document.querySelector("#motion-toggle");
const localClock = document.querySelector("#local-clock");
const toast = document.querySelector("#toast");
const canvas = document.querySelector("#ambient-canvas");
const context = canvas.getContext("2d");

let activeMember = 0;
let motionEnabled = true;
let width = 0;
let height = 0;
let deviceScale = 1;
let motes = [];
let ribbons = [];
let lastFrame = 0;

function renderCrew() {
  crewGrid.replaceChildren(
    ...crew
      .map((friend, index) => ({ friend, index }))
      .filter(({ index }) => index !== activeMember)
      .map(({ friend, index }) => {
        const card = document.createElement("button");
        card.className = "friend-card";
        card.type = "button";
        card.style.setProperty("--accent", friend.accent);
        card.setAttribute("aria-label", `查看 ${friend.name}`);
        card.innerHTML = `
          <span class="friend-avatar" aria-hidden="true">
            <img src="${friend.image}" alt="" />
          </span>
          <span class="role">${escapeHtml(friend.role)}</span>
          <strong>${escapeHtml(friend.name)}</strong>
          <small>${escapeHtml(friend.headline)}</small>
          <span class="signal-bar" aria-label="完成度 ${friend.signal}%">
            <i style="--signal: ${friend.signal}%"></i>
          </span>
        `;
        card.addEventListener("click", () => setActiveMember(index));
        return card;
      }),
  );
}

function renderMemberPanel() {
  const friend = crew[activeMember];
  const isExternalLink = /^https?:/.test(friend.link);
  const linkAttributes = isExternalLink ? ' target="_blank" rel="noreferrer"' : "";
  memberPanel.style.setProperty("--accent", friend.accent);
  memberPanel.innerHTML = `
    <div class="member-panel-top">
      <span class="friend-avatar" aria-hidden="true">
        <img src="${friend.image}" alt="" />
      </span>
      <div>
        <p class="eyebrow">${escapeHtml(friend.status)}</p>
        <h3>${escapeHtml(friend.name)}</h3>
        <span>${escapeHtml(friend.handle)}</span>
      </div>
    </div>
    <p>${escapeHtml(friend.quote)}</p>
    <p class="member-bio">${escapeHtml(friend.bio)}</p>
    <dl class="member-facts">
      ${friend.facts
        .map(
          ([term, detail]) => `
            <div>
              <dt>${escapeHtml(term)}</dt>
              <dd>${escapeHtml(detail)}</dd>
            </div>
          `,
        )
        .join("")}
    </dl>
    <div class="member-now">
      <span>当前</span>
      <p>${escapeHtml(friend.now)}</p>
    </div>
    <div class="member-now">
      <span>可以补充</span>
      <p>${escapeHtml(friend.favorite)}</p>
    </div>
    <div class="stats">${friend.tags.map((tag) => `<span>${escapeHtml(tag)}</span>`).join("")}</div>
    <a class="card-link" href="${friend.link}"${linkAttributes}>${escapeHtml(friend.action)}</a>
  `;
}

function setActiveMember(index) {
  activeMember = index;
  renderCrew();
  renderMemberPanel();
}

function renderMemories() {
  memoryList.replaceChildren(
    ...memories.map((item) => {
      const entry = document.createElement("article");
      entry.className = "memory-item";
      entry.innerHTML = `
        <img class="memory-thumb" src="${item.image}" alt="" />
        <span>${escapeHtml(item.label)}</span>
        <h3>${escapeHtml(item.title)}</h3>
        <p>${escapeHtml(item.text)}</p>
      `;
      return entry;
    }),
  );
}

function updateClock() {
  const formatter = new Intl.DateTimeFormat("zh-CN", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
  localClock.textContent = formatter.format(new Date());
}

async function copyText(value, label) {
  try {
    await navigator.clipboard.writeText(value);
    showToast(`${label} 已复制`);
  } catch {
    showToast(value);
  }
}

function showToast(message) {
  toast.textContent = message;
  toast.dataset.visible = "true";
  window.clearTimeout(showToast.timer);
  showToast.timer = window.setTimeout(() => {
    toast.dataset.visible = "false";
  }, 2200);
}

function resizeCanvas() {
  deviceScale = Math.min(window.devicePixelRatio || 1, 2);
  width = window.innerWidth;
  height = window.innerHeight;
  canvas.width = Math.floor(width * deviceScale);
  canvas.height = Math.floor(height * deviceScale);
  canvas.style.width = `${width}px`;
  canvas.style.height = `${height}px`;
  context.setTransform(deviceScale, 0, 0, deviceScale, 0, 0);
  buildAmbient();
}

function buildAmbient() {
  const moteCount = Math.max(42, Math.floor(width / 26));
  motes = Array.from({ length: moteCount }, () => ({
    x: Math.random() * width,
    y: Math.random() * height,
    radius: 0.7 + Math.random() * 1.8,
    speed: 0.08 + Math.random() * 0.26,
    alpha: 0.18 + Math.random() * 0.28,
  }));

  ribbons = Array.from({ length: 3 }, (_, index) => ({
    offset: Math.random() * Math.PI * 2,
    y: height * (0.24 + index * 0.18),
    alpha: 0.08 + index * 0.02,
  }));
}

function draw(now = 0) {
  const delta = Math.min(32, now - lastFrame || 16);
  lastFrame = now;
  context.clearRect(0, 0, width, height);
  drawBackdrop(now);
  if (motionEnabled) {
    drawRibbons(now);
    drawMotes(delta);
  }
  requestAnimationFrame(draw);
}

function drawBackdrop(now) {
  const gradient = context.createLinearGradient(0, 0, width, height);
  gradient.addColorStop(0, "rgba(97, 164, 143, 0.08)");
  gradient.addColorStop(0.45, "rgba(196, 164, 103, 0.035)");
  gradient.addColorStop(1, "rgba(143, 63, 77, 0.08)");
  context.fillStyle = gradient;
  context.fillRect(0, 0, width, height);

  const pulse = 0.5 + Math.sin(now * 0.0004) * 0.5;
  context.fillStyle = `rgba(246, 241, 232, ${0.018 + pulse * 0.012})`;
  context.fillRect(0, height * 0.18, width, 1);
  context.fillRect(0, height * 0.72, width, 1);
}

function drawRibbons(now) {
  ribbons.forEach((ribbon, ribbonIndex) => {
    context.beginPath();
    for (let x = -20; x <= width + 20; x += 24) {
      const y =
        ribbon.y +
        Math.sin(x * 0.008 + now * 0.00035 + ribbon.offset) * (22 + ribbonIndex * 12);
      if (x === -20) context.moveTo(x, y);
      else context.lineTo(x, y);
    }
    context.strokeStyle =
      ribbonIndex === 1
        ? `rgba(97, 164, 143, ${ribbon.alpha})`
        : `rgba(196, 164, 103, ${ribbon.alpha})`;
    context.lineWidth = 1.2;
    context.stroke();
  });
}

function drawMotes(delta) {
  motes.forEach((mote) => {
    mote.y -= mote.speed * delta * 0.06;
    if (mote.y < -10) {
      mote.x = Math.random() * width;
      mote.y = height + Math.random() * 80;
    }
    context.beginPath();
    context.arc(mote.x, mote.y, mote.radius, 0, Math.PI * 2);
    context.fillStyle = `rgba(246, 241, 232, ${mote.alpha})`;
    context.fill();
  });
}

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, (char) => {
    const entities = {
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#039;",
    };
    return entities[char];
  });
}

motionToggle.addEventListener("click", () => {
  motionEnabled = !motionEnabled;
  motionToggle.setAttribute("aria-pressed", String(motionEnabled));
  showToast(motionEnabled ? "背景动效已开启" : "背景动效已关闭");
});

document.querySelector("#copy-site").addEventListener("click", () => copyText(SITE_URL, "网站链接"));
document.querySelector("#copy-repo").addEventListener("click", () => copyText(REPO_URL, "仓库链接"));

window.addEventListener("resize", resizeCanvas);

renderCrew();
renderMemberPanel();
renderMemories();
updateClock();
window.setInterval(updateClock, 30_000);
resizeCanvas();
requestAnimationFrame(draw);
