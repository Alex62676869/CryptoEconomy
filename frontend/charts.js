"use strict";

(function attachChartsToWindow() {
  const MAX_POINTS = 320;

  const chartState = {
    priceChart: {
      canvas: null,
      ctx: null,
      points: []
    }
  };

  function initCharts() {
    const priceCanvas = document.getElementById("priceChart");

    if (priceCanvas) {
      chartState.priceChart.canvas = priceCanvas;
      chartState.priceChart.ctx = priceCanvas.getContext("2d");

      resizeCanvasForDevicePixelRatio(priceCanvas);
      drawPriceChart([]);
    }

    window.addEventListener("resize", () => {
      if (chartState.priceChart.canvas) {
        resizeCanvasForDevicePixelRatio(chartState.priceChart.canvas);
        drawPriceChart(chartState.priceChart.points);
      }
    });
  }

  function updatePriceChart(state) {
    const points = normalisePricePoints(state);
    chartState.priceChart.points = points.slice(-MAX_POINTS);
    drawPriceChart(chartState.priceChart.points);
  }

  function normalisePricePoints(state) {
    const chartPoints = state?.charts?.prices;

    if (Array.isArray(chartPoints) && chartPoints.length > 0) {
      return chartPoints
        .filter((point) => point && Number.isFinite(Number(point.mono)) && Number.isFinite(Number(point.div)))
        .map((point) => ({
          tick: Number(point.tick || 0),
          simulatedDay: Number(point.simulatedDay || point.tick || 0),
          mono: Number(point.mono),
          div: Number(point.div),
          monoPolicyMidpoint: Number(point.monoPolicyMidpoint || point.monoMidpoint || point.mono || 1),
          divPolicyMidpoint: Number(point.divPolicyMidpoint || point.divMidpoint || point.div || 1)
        }));
    }

    const fallbackPoint = {
      tick: Number(state?.runtime?.tick || 0),
      simulatedDay: Number(state?.runtime?.simulatedDay || 0),
      mono: Number(state?.prices?.mono?.market || 1),
      div: Number(state?.prices?.div?.market || 1),
      monoPolicyMidpoint: Number(state?.prices?.mono?.policyMidpoint || 1),
      divPolicyMidpoint: Number(state?.prices?.div?.policyMidpoint || 1)
    };

    return [fallbackPoint];
  }

  function drawPriceChart(points) {
    const chart = chartState.priceChart;

    if (!chart.canvas || !chart.ctx) {
      return;
    }

    const ctx = chart.ctx;
    const canvas = chart.canvas;
    const rect = canvas.getBoundingClientRect();

    const width = rect.width;
    const height = rect.height;

    ctx.clearRect(0, 0, width, height);

    drawChartBackground({
      ctx,
      width,
      height
    });

    if (!Array.isArray(points) || points.length === 0) {
      drawEmptyChart({
        ctx,
        width,
        height,
        message: "Waiting for price data"
      });
      return;
    }

    const series = [
      {
        key: "mono",
        label: "Mono Market",
        color: "#7dd3fc",
        width: 3,
        dash: []
      },
      {
        key: "div",
        label: "DIV Market",
        color: "#c4b5fd",
        width: 3,
        dash: []
      },
      {
        key: "monoPolicyMidpoint",
        label: "Mono Policy Mid",
        color: "rgba(125, 211, 252, 0.45)",
        width: 1.5,
        dash: [6, 7]
      },
      {
        key: "divPolicyMidpoint",
        label: "DIV Policy Mid",
        color: "rgba(196, 181, 253, 0.45)",
        width: 1.5,
        dash: [6, 7]
      }
    ];

    const chartArea = {
      left: 64,
      right: width - 24,
      top: 28,
      bottom: height - 46
    };

    const bounds = calculateBounds({
      points,
      series
    });

    drawAxes({
      ctx,
      width,
      height,
      chartArea,
      bounds
    });

    for (const item of series) {
      drawLine({
        ctx,
        points,
        key: item.key,
        chartArea,
        bounds,
        color: item.color,
        lineWidth: item.width,
        dash: item.dash
      });
    }

    drawLatestMarkers({
      ctx,
      points,
      series,
      chartArea,
      bounds
    });

    drawLegend({
      ctx,
      series,
      width,
      height
    });
  }

  function drawChartBackground({ ctx, width, height }) {
    const gradient = ctx.createLinearGradient(0, 0, 0, height);
    gradient.addColorStop(0, "rgba(15, 23, 42, 0.15)");
    gradient.addColorStop(1, "rgba(2, 6, 23, 0.08)");

    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, width, height);
  }

  function drawEmptyChart({ ctx, width, height, message }) {
    ctx.save();
    ctx.fillStyle = "rgba(203, 213, 225, 0.72)";
    ctx.font = "700 14px Inter, system-ui, sans-serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(message, width / 2, height / 2);
    ctx.restore();
  }

  function drawAxes({
    ctx,
    width,
    height,
    chartArea,
    bounds
  }) {
    ctx.save();

    ctx.strokeStyle = "rgba(148, 163, 184, 0.16)";
    ctx.lineWidth = 1;

    const horizontalLines = 5;

    for (let index = 0; index <= horizontalLines; index += 1) {
      const t = index / horizontalLines;
      const y = chartArea.top + (chartArea.bottom - chartArea.top) * t;

      ctx.beginPath();
      ctx.moveTo(chartArea.left, y);
      ctx.lineTo(chartArea.right, y);
      ctx.stroke();

      const value = bounds.max - (bounds.max - bounds.min) * t;

      ctx.fillStyle = "rgba(148, 163, 184, 0.88)";
      ctx.font = "700 11px Inter, system-ui, sans-serif";
      ctx.textAlign = "right";
      ctx.textBaseline = "middle";
      ctx.fillText(formatUsdAxis(value), chartArea.left - 10, y);
    }

    const verticalLines = 6;

    for (let index = 0; index <= verticalLines; index += 1) {
      const t = index / verticalLines;
      const x = chartArea.left + (chartArea.right - chartArea.left) * t;

      ctx.beginPath();
      ctx.moveTo(x, chartArea.top);
      ctx.lineTo(x, chartArea.bottom);
      ctx.stroke();
    }

    ctx.strokeStyle = "rgba(148, 163, 184, 0.28)";
    ctx.beginPath();
    ctx.moveTo(chartArea.left, chartArea.bottom);
    ctx.lineTo(chartArea.right, chartArea.bottom);
    ctx.stroke();

    ctx.fillStyle = "rgba(148, 163, 184, 0.72)";
    ctx.font = "700 11px Inter, system-ui, sans-serif";
    ctx.textAlign = "left";
    ctx.textBaseline = "bottom";
    ctx.fillText("Price", 12, 18);

    ctx.textAlign = "right";
    ctx.fillText("Latest", width - 24, height - 16);

    ctx.restore();
  }

  function drawLine({
    ctx,
    points,
    key,
    chartArea,
    bounds,
    color,
    lineWidth,
    dash
  }) {
    if (points.length === 0) {
      return;
    }

    ctx.save();

    ctx.strokeStyle = color;
    ctx.lineWidth = lineWidth;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.setLineDash(dash || []);

    ctx.beginPath();

    points.forEach((point, index) => {
      const x = getX({
        index,
        total: points.length,
        chartArea
      });

      const y = getY({
        value: Number(point[key]),
        chartArea,
        bounds
      });

      if (index === 0) {
        ctx.moveTo(x, y);
      } else {
        ctx.lineTo(x, y);
      }
    });

    ctx.stroke();
    ctx.restore();
  }

  function drawLatestMarkers({
    ctx,
    points,
    series,
    chartArea,
    bounds
  }) {
    const latestIndex = points.length - 1;
    const latest = points[latestIndex];

    if (!latest) {
      return;
    }

    for (const item of series.slice(0, 2)) {
      const value = Number(latest[item.key]);

      if (!Number.isFinite(value)) {
        continue;
      }

      const x = getX({
        index: latestIndex,
        total: points.length,
        chartArea
      });

      const y = getY({
        value,
        chartArea,
        bounds
      });

      ctx.save();

      ctx.fillStyle = item.color;
      ctx.beginPath();
      ctx.arc(x, y, 4.5, 0, Math.PI * 2);
      ctx.fill();

      ctx.fillStyle = "rgba(248, 250, 252, 0.94)";
      ctx.font = "800 11px Inter, system-ui, sans-serif";
      ctx.textAlign = "left";
      ctx.textBaseline = "middle";
      ctx.fillText(formatUsdAxis(value), Math.min(x + 8, chartArea.right - 56), y);

      ctx.restore();
    }
  }

  function drawLegend({
    ctx,
    series,
    width
  }) {
    ctx.save();

    const startX = Math.max(72, width - 570);
    let x = startX;
    const y = 18;

    ctx.font = "800 11px Inter, system-ui, sans-serif";
    ctx.textBaseline = "middle";

    for (const item of series) {
      ctx.strokeStyle = item.color;
      ctx.lineWidth = item.width;
      ctx.setLineDash(item.dash || []);

      ctx.beginPath();
      ctx.moveTo(x, y);
      ctx.lineTo(x + 24, y);
      ctx.stroke();

      ctx.setLineDash([]);
      ctx.fillStyle = "rgba(203, 213, 225, 0.92)";
      ctx.fillText(item.label, x + 30, y);

      x += ctx.measureText(item.label).width + 64;
    }

    ctx.restore();
  }

  function calculateBounds({
    points,
    series
  }) {
    const values = [];

    for (const point of points) {
      for (const item of series) {
        const value = Number(point[item.key]);

        if (Number.isFinite(value)) {
          values.push(value);
        }
      }
    }

    if (values.length === 0) {
      return {
        min: 0.95,
        max: 1.05
      };
    }

    let min = Math.min(...values);
    let max = Math.max(...values);

    if (min === max) {
      min -= 0.05;
      max += 0.05;
    }

    const padding = Math.max((max - min) * 0.16, 0.01);

    return {
      min: Math.max(0, min - padding),
      max: max + padding
    };
  }

  function getX({
    index,
    total,
    chartArea
  }) {
    if (total <= 1) {
      return chartArea.left;
    }

    return chartArea.left + (chartArea.right - chartArea.left) * (index / (total - 1));
  }

  function getY({
    value,
    chartArea,
    bounds
  }) {
    const safeValue = Number.isFinite(value) ? value : bounds.min;
    const range = Math.max(0.000001, bounds.max - bounds.min);
    const t = (safeValue - bounds.min) / range;

    return chartArea.bottom - (chartArea.bottom - chartArea.top) * t;
  }

  function resizeCanvasForDevicePixelRatio(canvas) {
    const rect = canvas.getBoundingClientRect();
    const ratio = window.devicePixelRatio || 1;

    canvas.width = Math.max(1, Math.floor(rect.width * ratio));
    canvas.height = Math.max(1, Math.floor(rect.height * ratio));

    const ctx = canvas.getContext("2d");
    ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
  }

  function formatUsdAxis(value) {
    const number = Number(value || 0);

    if (!Number.isFinite(number)) {
      return "$0.00";
    }

    if (Math.abs(number) >= 1000) {
      return `$${number.toLocaleString("en-US", {
        maximumFractionDigits: 0
      })}`;
    }

    if (Math.abs(number) >= 10) {
      return `$${number.toFixed(2)}`;
    }

    if (Math.abs(number) >= 1) {
      return `$${number.toFixed(4)}`;
    }

    return `$${number.toFixed(6)}`;
  }

  function updateGauge({
    element,
    value
  }) {
    if (!element) {
      return;
    }

    const safeValue = clamp(Number(value || 0), 0, 100);
    const degrees = safeValue * 3.6;

    let color = "#86efac";

    if (safeValue < 40) {
      color = "#fca5a5";
    } else if (safeValue < 65) {
      color = "#fde68a";
    }

    element.style.background = `
      radial-gradient(circle at center, rgba(15, 23, 42, 0.88) 0 56%, transparent 57%),
      conic-gradient(${color} 0deg, ${color} ${degrees}deg, rgba(148, 163, 184, 0.16) ${degrees}deg 360deg)
    `;
  }

  function clamp(value, min, max) {
    const number = Number(value);

    if (!Number.isFinite(number)) {
      return min;
    }

    return Math.min(max, Math.max(min, number));
  }

  window.MonoDivCharts = {
    initCharts,
    updatePriceChart,
    updateGauge
  };
})();
