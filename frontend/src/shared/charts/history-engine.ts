/** Heavy ECharts dependency is imported by HistoryChart only after DOMContentLoaded.
 * Keep the same chart/component registration as the original eager importer.
 */
import * as echarts from 'echarts/core';
import {LineChart,BarChart} from 'echarts/charts';
import {GridComponent,TooltipComponent,DataZoomComponent} from 'echarts/components';
import {SVGRenderer} from 'echarts/renderers';
echarts.use([LineChart,BarChart,GridComponent,TooltipComponent,DataZoomComponent,SVGRenderer]);
export {echarts};
