# trzsz2

[中文](README.cn.md) | [English](README.md)

> trzsz.js 的衍生项目，提供纯协议实现，支持 Node.js 和浏览器环境。

## 声明

**本项目基于 [Lonny Wong](https://github.com/lonnywong) 开发的 [trzsz-js](https://github.com/trzsz/trzsz.js)。**

trzsz 协议的所有原始实现功劳归 Lonny Wong 所有。这是一个衍生作品：

- 移除了原始代码库中的文件系统 (`fs`) 和浏览器特定依赖
- 专注于提供适合 Node.js 环境的纯协议实现
- 通过浏览器构建版本保持浏览器兼容性

## 从源码构建

```bash
# 克隆仓库
git clone https://github.com/zxdong262/trzsz2.git
cd trzsz2

# 安装依赖
npm install

# 构建所有格式
npm run build

# 构建特定格式
npm run build:esm    # 仅 ESM
npm run build:cjs    # 仅 CommonJS
npm run build:cjs-full  # 打包的 CommonJS
npm run build:browser  # 浏览器包
```

## 测试

```bash
# 运行单元测试
npm test

# 运行集成测试（需要 Docker）
npm run test:upload
npm run test:download

# 监视模式
npm run test:watch
```

## 待办事项

- [ ] 浏览器使用文档和示例
- [ ] 浏览器环境测试和演示
- [ ] WebRTC 数据通道集成示例

## 相关项目

- [trzsz-js](https://github.com/trzsz/trzsz.js) - Lonny Wong 开发的原始 trzsz 实现，包含文件系统支持
- [trzsz](https://github.com/trzsz/trzsz) - trzsz 主项目

## 许可证

MIT
