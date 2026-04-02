# Charting Skill

Generate and manipulate charts and data visualizations programmatically.

## Overview

The charting skill provides tools to create various types of charts including:
- Bar charts
- Line charts
- Pie charts
- Scatter plots
- Area charts
- Histograms

## When to Use This Skill

Use this skill when you need to:
- Create data visualizations
- Generate charts from datasets
- Produce graphs for reports or dashboards
- Visualize trends and patterns in data

## Features

- Multiple chart types support
- Customizable colors and styles
- Data transformation utilities
- Export to multiple formats (PNG, SVG, PDF)
- Interactive chart options

## Installation

```bash
npx skills add starchild-ai-agent/official-skills@charting
```

## Quick Start

### Creating a Bar Chart

```javascript
const { createChart } = require('@starchild-ai-agent/official-skills/charting');

const chart = createChart('bar', {
  title: 'Sales by Quarter',
  data: [
    { label: 'Q1', value: 1000 },
    { label: 'Q2', value: 1500 },
    { label: 'Q3', value: 1200 },
    { label: 'Q4', value: 2000 }
  ],
  xAxis: 'label',
  yAxis: 'value'
});

chart.save('chart.png');
```

### Creating a Line Chart

```javascript
const { createChart } = require('@starchild-ai-agent/official-skills/charting');

const chart = createChart('line', {
  title: 'Website Traffic',
  data: [
    { date: '2024-01-01', visitors: 1000 },
    { date: '2024-01-02', visitors: 1200 },
    { date: '2024-01-03', visitors: 1100 }
  ],
  xAxis: 'date',
  yAxis: 'visitors'
});

chart.save('traffic.svg');
```

### Creating a Pie Chart

```javascript
const { createChart } = require('@starchild-ai-agent/official-skills/charting');

const chart = createChart('pie', {
  title: 'Market Share',
  data: [
    { label: 'Product A', value: 30 },
    { label: 'Product B', value: 25 },
    { label: 'Product C', value: 45 }
  ]
});

chart.save('market-share.png');
```

## API Reference

### createChart(type, options)

Create a chart of the specified type.

**Parameters:**
- `type` (string): Chart type - 'bar', 'line', 'pie', 'scatter', 'area', 'histogram'
- `options` (object): Configuration object
  - `title` (string): Chart title
  - `data` (array): Data points
  - `xAxis` (string): X-axis field name
  - `yAxis` (string): Y-axis field name
  - `colors` (array): Optional color palette
  - `width` (number): Chart width in pixels
  - `height` (number): Chart height in pixels

**Returns:** Chart object with methods:
- `save(filename)` - Save chart to file
- `render()` - Get chart as HTML/SVG
- `export(format)` - Export in specified format

### Chart Methods

- **save(filename)** - Save the chart to a file (PNG, SVG, PDF)
- **render()** - Render chart as HTML/SVG string
- **export(format)** - Export chart in different formats
- **update(options)** - Update chart configuration
- **addData(data)** - Add additional data points

## Supported Formats

Export formats: PNG, SVG, PDF, HTML, JSON

## Tips & Best Practices

1. **Data Preparation**: Clean and format your data before passing to chart creator
2. **Color Selection**: Use accessible color palettes for better visualization
3. **Responsiveness**: Consider chart dimensions for different display contexts
4. **Performance**: For large datasets, consider aggregation or sampling
5. **Labels**: Always include meaningful titles and axis labels

## Common Use Cases

### Sales Dashboard
```javascript
const salesChart = createChart('bar', {
  title: 'Monthly Sales',
  data: salesData,
  xAxis: 'month',
  yAxis: 'amount'
});
```

### Time Series Analysis
```javascript
const trendChart = createChart('line', {
  title: 'Stock Price Trend',
  data: priceHistory,
  xAxis: 'date',
  yAxis: 'price'
});
```

### Distribution Analysis
```javascript
const distributionChart = createChart('histogram', {
  title: 'Data Distribution',
  data: values
});
```

## Troubleshooting

### Chart not rendering
- Verify data is properly formatted
- Check that required fields (xAxis, yAxis) exist in data
- Ensure chart type is supported

### Export fails
- Check file path is writable
- Verify export format is supported
- Ensure sufficient disk space

## Related Skills

- Data processing and transformation skills
- Reporting and dashboard skills
- Data analysis utilities

## Support

For issues, visit: https://github.com/starchild-ai-agent/official-skills/issues

---

**Source**: starchild-ai-agent/official-skills  
**Installs**: 3.7K+  
**Last Updated**: 2024
