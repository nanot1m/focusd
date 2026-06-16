const WATER_DURATION_MS = 3000;

globalThis.focusdWater = {
  start: startWaterShader
};

async function startWaterShader(canvas, options = {}) {
  if (!canvas || !navigator.gpu) {
    return false;
  }

  const adapter = await navigator.gpu.requestAdapter();
  if (!adapter) {
    return false;
  }

  const device = await adapter.requestDevice();
  const context = canvas.getContext("webgpu");
  const format = navigator.gpu.getPreferredCanvasFormat();
  const duration = options.duration ?? WATER_DURATION_MS;

  configureCanvas(canvas, context, device, format);

  const uniformBuffer = device.createBuffer({
    size: 16,
    usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST
  });

  const shader = device.createShaderModule({
    code: `
      struct Uniforms {
        time: f32,
        progress: f32,
        aspect: f32,
        pad: f32,
      };

      @group(0) @binding(0) var<uniform> uniforms: Uniforms;

      struct VertexOut {
        @builtin(position) position: vec4f,
        @location(0) uv: vec2f,
      };

      @vertex
      fn vertexMain(@builtin(vertex_index) index: u32) -> VertexOut {
        var positions = array<vec2f, 6>(
          vec2f(-1.0, -1.0),
          vec2f(1.0, -1.0),
          vec2f(-1.0, 1.0),
          vec2f(-1.0, 1.0),
          vec2f(1.0, -1.0),
          vec2f(1.0, 1.0)
        );

        let position = positions[index];
        var out: VertexOut;
        out.position = vec4f(position, 0.0, 1.0);
        out.uv = position * 0.5 + vec2f(0.5);
        return out;
      }

      fn wave(x: f32, t: f32) -> f32 {
        return
          sin(x * 7.2 + t * 1.7) * 0.026 +
          sin(x * 13.0 - t * 2.3) * 0.016 +
          sin(x * 23.0 + t * 1.1) * 0.008 +
          sin(x * 41.0 - t * 3.7) * 0.003;
      }

      fn caustic(uv: vec2f, t: f32) -> f32 {
        let p = uv * vec2f(9.0, 12.0);
        let a = sin(p.x + sin(p.y + t * 0.9) + t * 1.8);
        let b = sin(p.y * 1.25 + cos(p.x * 0.8 - t * 0.7) - t * 1.2);
        let c = sin((p.x + p.y) * 1.6 + t * 1.4);
        return pow(clamp((a + b + c) / 3.0 * 0.5 + 0.5, 0.0, 1.0), 5.0);
      }

      @fragment
      fn fragmentMain(input: VertexOut) -> @location(0) vec4f {
        let uv = input.uv;
        let centered = (uv - vec2f(0.5)) * vec2f(uniforms.aspect, 1.0);
        let radius = length(centered);

        if (radius > 0.492) {
          discard;
        }

        let edge = 1.0 - smoothstep(0.462, 0.492, radius);
        let waterLine = 0.06 + uniforms.progress * 0.84;
        let surfaceTilt = (uv.x - 0.5) * sin(uniforms.time * 0.65) * 0.018;
        let surface = waterLine + wave(uv.x, uniforms.time) + surfaceTilt;
        let fill = smoothstep(surface + 0.014, surface - 0.014, uv.y);

        let depth = clamp((surface - uv.y) * 2.2 + 0.16, 0.0, 1.0);
        let shallow = vec3f(0.48, 0.88, 1.0);
        let mid = vec3f(0.06, 0.47, 0.88);
        let deep = vec3f(0.01, 0.17, 0.48);
        let base = mix(mix(shallow, mid, smoothstep(0.0, 0.55, depth)), deep, smoothstep(0.45, 1.0, depth));

        let caustics = caustic(uv + vec2f(uniforms.time * 0.025, -uniforms.time * 0.018), uniforms.time);
        let fineRipple =
          sin((uv.x * 54.0 + uv.y * 18.0) + uniforms.time * 4.5) * 0.012 +
          sin((uv.x * -34.0 + uv.y * 42.0) - uniforms.time * 3.2) * 0.010;
        let surfaceFoam = smoothstep(0.050, 0.0, abs(uv.y - surface)) * (0.55 + sin(uv.x * 48.0 + uniforms.time * 5.0) * 0.12);
        let rimLight = smoothstep(0.43, 0.49, radius) * fill * 0.16;
        let glass = vec3f(0.90, 0.97, 1.0) * (1.0 - fill) * 0.18;
        let color =
          base +
          caustics * vec3f(0.22, 0.52, 0.72) * fill +
          fineRipple * fill +
          surfaceFoam * vec3f(0.78, 0.96, 1.0) +
          rimLight * vec3f(0.55, 0.86, 1.0) +
          glass;

        let alpha = clamp((fill * 0.93 + (1.0 - fill) * 0.14) * edge, 0.0, 0.96);
        return vec4f(color, alpha);
      }
    `
  });

  const pipeline = device.createRenderPipeline({
    layout: "auto",
    vertex: {
      module: shader,
      entryPoint: "vertexMain"
    },
    fragment: {
      module: shader,
      entryPoint: "fragmentMain",
      targets: [
        {
          format,
          blend: {
            color: {
              srcFactor: "src-alpha",
              dstFactor: "one-minus-src-alpha",
              operation: "add"
            },
            alpha: {
              srcFactor: "one",
              dstFactor: "one-minus-src-alpha",
              operation: "add"
            }
          }
        }
      ]
    },
    primitive: {
      topology: "triangle-list"
    }
  });

  const bindGroup = device.createBindGroup({
    layout: pipeline.getBindGroupLayout(0),
    entries: [
      {
        binding: 0,
        resource: {
          buffer: uniformBuffer
        }
      }
    ]
  });

  const start = performance.now();
  canvas.classList.add("is-active");
  renderFrame();
  return true;

  function renderFrame(now = performance.now()) {
    if (!canvas.isConnected || canvas.hidden) {
      return;
    }

    const elapsed = now - start;
    const progress = Math.min(elapsed / duration, 1);
    const uniforms = new Float32Array([
      elapsed / 1000,
      easeInOut(progress),
      canvas.width / canvas.height,
      0
    ]);

    device.queue.writeBuffer(uniformBuffer, 0, uniforms);

    const encoder = device.createCommandEncoder();
    const pass = encoder.beginRenderPass({
      colorAttachments: [
        {
          view: context.getCurrentTexture().createView(),
          clearValue: { r: 0, g: 0, b: 0, a: 0 },
          loadOp: "clear",
          storeOp: "store"
        }
      ]
    });

    pass.setPipeline(pipeline);
    pass.setBindGroup(0, bindGroup);
    pass.draw(6);
    pass.end();
    device.queue.submit([encoder.finish()]);

    requestAnimationFrame(renderFrame);
  }
}

function configureCanvas(canvas, context, device, format) {
  const rect = canvas.getBoundingClientRect();
  const scale = Math.min(devicePixelRatio || 1, 2);
  canvas.width = Math.max(1, Math.round(rect.width * scale));
  canvas.height = Math.max(1, Math.round(rect.height * scale));
  context.configure({
    device,
    format,
    alphaMode: "premultiplied"
  });
}

function easeInOut(value) {
  return value * value * (3 - 2 * value);
}
