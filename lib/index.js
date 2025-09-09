import * as React from 'react';
import * as PropTypes from 'prop-types';
import cn from 'classnames';
import { VariableSizeList } from 'react-window';
import AutoSizer from 'react-virtualized-auto-sizer';
import { computeLineInformation, DiffType, DiffMethod, } from './compute-lines';
import computeStyles from './styles';
const m = require('memoize-one');
const memoize = m.default || m;
export var LineNumberPrefix;
(function (LineNumberPrefix) {
    LineNumberPrefix["LEFT"] = "L";
    LineNumberPrefix["RIGHT"] = "R";
})(LineNumberPrefix || (LineNumberPrefix = {}));
class DiffViewer extends React.Component {
    constructor(props) {
        super(props);
        this.listRef = React.createRef();
        this.itemHeights = {};
        this.lineInformation = [];
        this.processedLines = [];
        this.lastContainerWidth = 0;
        this.resetCodeBlocks = () => {
            if (this.state.expandedBlocks.length > 0) {
                this.setState({
                    expandedBlocks: [],
                });
                return true;
            }
            return false;
        };
        this.onBlockExpand = (id) => {
            const prevState = this.state.expandedBlocks.slice();
            prevState.push(id);
            this.setState({
                expandedBlocks: prevState,
            });
        };
        this.computeStyles = memoize(computeStyles);
        this.onLineNumberClickProxy = (id) => {
            if (this.props.onLineNumberClick) {
                return (e) => this.props.onLineNumberClick(id, e);
            }
            return () => { };
        };
        this.renderWordDiff = (diffArray, renderer) => {
            return diffArray.map((wordDiff, i) => {
                return (React.createElement("span", { key: i, className: cn(this.styles.wordDiff, {
                        [this.styles.wordAdded]: wordDiff.type === DiffType.ADDED,
                        [this.styles.wordRemoved]: wordDiff.type === DiffType.REMOVED,
                        [this.styles.wordNoised]: wordDiff.type === DiffType.NOISED,
                    }), "data-flattenpath": wordDiff.flattenPath || '' }, renderer ? renderer(wordDiff.value) : wordDiff.value));
            });
        };
        this.renderLine = (lineNumber, type, prefix, value, flattenPath, additionalLineNumber, additionalPrefix) => {
            const lineNumberTemplate = `${prefix}-${lineNumber}`;
            const additionalLineNumberTemplate = `${additionalPrefix}-${additionalLineNumber}`;
            const highlightLine = this.props.highlightLines.includes(lineNumberTemplate) ||
                this.props.highlightLines.includes(additionalLineNumberTemplate);
            const added = type === DiffType.ADDED;
            const removed = type === DiffType.REMOVED;
            const noised = type === DiffType.NOISED;
            let content;
            if (Array.isArray(value)) {
                content = this.renderWordDiff(value, this.props.renderContent);
            }
            else if (this.props.renderContent) {
                content = this.props.renderContent(value);
            }
            else {
                content = value;
            }
            return (React.createElement(React.Fragment, null,
                !this.props.hideLineNumbers && (React.createElement("td", { onClick: lineNumber && this.onLineNumberClickProxy(lineNumberTemplate), className: cn(this.styles.gutter, {
                        [this.styles.emptyGutter]: !lineNumber,
                        [this.styles.highlightedGutter]: highlightLine,
                    }), "data-flattenpath": flattenPath || '', style: {
                        verticalAlign: 'middle',
                        padding: 0,
                        height: '100%',
                        background: '#f4f4f4',
                        width: '100%',
                    } },
                    React.createElement("div", { style: {
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            height: '100%',
                            width: '100%',
                        } },
                        React.createElement("pre", { className: this.styles.lineNumber, style: {
                                textAlign: 'center',
                                fontVariantNumeric: 'tabular-nums',
                                minWidth: 48,
                                margin: 0,
                                padding: 0,
                                background: 'transparent',
                                height: '100%',
                                width: '100%',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                boxSizing: 'border-box',
                            } }, lineNumber)))),
                !this.props.splitView && !this.props.hideLineNumbers && (React.createElement("td", { onClick: additionalLineNumber && this.onLineNumberClickProxy(additionalLineNumberTemplate), className: cn(this.styles.gutter, {
                        [this.styles.emptyGutter]: !additionalLineNumber,
                        [this.styles.diffAdded]: added,
                        [this.styles.diffRemoved]: removed,
                        [this.styles.diffNoised]: noised,
                        [this.styles.highlightedGutter]: highlightLine,
                    }), "data-flattenpath": flattenPath || '', style: { verticalAlign: 'top' } },
                    React.createElement("pre", { className: this.styles.lineNumber }, additionalLineNumber))),
                this.props.renderGutter && (React.createElement("td", { className: this.styles.gutter, "data-flattenpath": flattenPath || '', style: {
                        verticalAlign: 'middle',
                        minWidth: '30px',
                        width: '30px',
                        textAlign: 'center',
                        padding: '0',
                        margin: '0',
                        background: 'transparent',
                        border: 'none',
                        lineHeight: 'inherit'
                    } }, this.props.renderGutter({
                    lineNumber,
                    type,
                    prefix,
                    value,
                    additionalLineNumber,
                    additionalPrefix,
                    styles: this.styles,
                    flattenPath: flattenPath || '',
                }))),
                React.createElement("td", { className: cn(this.styles.marker, {
                        [this.styles.emptyLine]: !content,
                        [this.styles.diffAdded]: added,
                        [this.styles.diffRemoved]: removed,
                        [this.styles.diffNoised]: noised,
                        [this.styles.highlightedLine]: highlightLine,
                    }), "data-flattenpath": flattenPath || '', style: {
                        verticalAlign: 'middle',
                        textAlign: 'center',
                        padding: '0',
                        lineHeight: 'inherit'
                    } },
                    React.createElement("pre", { style: { margin: '0', padding: '0', lineHeight: 'inherit' } },
                        added && '+',
                        removed && '-')),
                React.createElement("td", { className: cn(this.styles.content, {
                        [this.styles.emptyLine]: !content,
                        [this.styles.diffAdded]: added,
                        [this.styles.diffRemoved]: removed,
                        [this.styles.diffNoised]: noised,
                        [this.styles.highlightedLine]: highlightLine,
                    }), "data-flattenpath": flattenPath || '', style: { verticalAlign: 'top' } },
                    React.createElement("pre", { className: cn(this.styles.contentText, {
                            [this.styles.wordNoised]: noised,
                        }) }, content))));
        };
        // Get row height for virtualization
        this.getRowHeight = (index) => {
            if (this.itemHeights[index]) {
                return this.itemHeights[index];
            }
            const line = this.lineInformation[index];
            if (!line)
                return 32;
            const leftContent = Array.isArray(line.left.value)
                ? line.left.value.map(v => v.value).join('')
                : line.left.value || '';
            const rightContent = Array.isArray(line.right.value)
                ? line.right.value.map(v => v.value).join('')
                : line.right.value || '';
            const maxLength = Math.max(leftContent.length, rightContent.length);
            const estimatedCharsPerLine = Math.max(40, Math.min(120, this.lastContainerWidth / 10));
            const estimatedLines = Math.max(1, Math.ceil(maxLength / estimatedCharsPerLine));
            const baseHeight = 28;
            const lineHeight = 20;
            return Math.min(200, baseHeight + (estimatedLines - 1) * lineHeight); // Cap max height
        };
        this.setRowHeight = (index, size) => {
            if (this.itemHeights[index] !== size) {
                this.itemHeights[index] = size;
                if (this.listRef.current) {
                    this.listRef.current.resetAfterIndex(index);
                }
            }
        };
        this.clearHeightsOnWidthChange = (newWidth) => {
            const widthDifference = Math.abs(newWidth - this.lastContainerWidth);
            if (widthDifference > 100) {
                this.itemHeights = {};
                this.lastContainerWidth = newWidth;
                if (this.listRef.current) {
                    this.listRef.current.resetAfterIndex(0);
                }
            }
        };
        // Virtualized row renderer - only renders what's visible
        this.VirtualizedRow = ({ index, style }) => {
            const rowRef = React.useRef(null);
            const [forceUpdate, setForceUpdate] = React.useState(0);
            React.useEffect(() => {
                if (rowRef.current) {
                    const height = rowRef.current.getBoundingClientRect().height;
                    // Only update if height changed significantly to avoid infinite re-renders
                    if (Math.abs((this.itemHeights[index] || 0) - height) > 3) {
                        this.setRowHeight(index, height);
                    }
                }
            });
            React.useEffect(() => {
                const handleInteraction = (e) => {
                    const target = e.target;
                    if (target.tagName === 'INPUT' || target.tagName === 'SELECT' || target.tagName === 'TEXTAREA') {
                        setTimeout(() => setForceUpdate(prev => prev + 1), 0);
                    }
                };
                if (rowRef.current) {
                    const element = rowRef.current;
                    element.addEventListener('change', handleInteraction);
                    element.addEventListener('input', handleInteraction);
                    return () => {
                        element.removeEventListener('change', handleInteraction);
                        element.removeEventListener('input', handleInteraction);
                    };
                }
            }, []);
            const line = this.lineInformation[index];
            if (!line)
                return null;
            const { splitView } = this.props;
            const estimatedHeight = this.getRowHeight(index);
            return (React.createElement("div", { key: `row-${index}-${forceUpdate}-${!!this.props.renderGutter}`, style: Object.assign(Object.assign({}, style), { minHeight: Math.max(32, estimatedHeight), height: 'auto' }), ref: rowRef },
                React.createElement("table", { className: cn(this.styles.diffContainer, {
                        [this.styles.splitView]: splitView,
                    }), style: {
                        width: '100%',
                        tableLayout: 'fixed',
                        wordBreak: 'break-word',
                        borderCollapse: 'separate',
                        borderSpacing: 0
                    } },
                    React.createElement("colgroup", null,
                        !this.props.hideLineNumbers && React.createElement("col", { style: { width: '50px', minWidth: '50px' } }),
                        !this.props.splitView && !this.props.hideLineNumbers && React.createElement("col", { style: { width: '50px', minWidth: '50px' } }),
                        this.props.renderGutter && React.createElement("col", { style: { width: '30px', minWidth: '30px' } }),
                        React.createElement("col", { style: { width: '30px', minWidth: '30px' } }),
                        React.createElement("col", { style: { width: 'auto' } }),
                        this.props.splitView && (React.createElement(React.Fragment, null,
                            !this.props.hideLineNumbers && React.createElement("col", { style: { width: '50px', minWidth: '50px' } }),
                            this.props.renderGutter && React.createElement("col", { style: { width: '30px', minWidth: '30px' } }),
                            React.createElement("col", { style: { width: '30px', minWidth: '30px' } }),
                            React.createElement("col", { style: { width: 'auto' } })))),
                    React.createElement("tbody", null, splitView ? this.renderSplitViewRow(line, index) : this.renderInlineViewRow(line, index)))));
        };
        this.renderSplitViewRow = (line, index) => {
            const { left, right } = line;
            return (React.createElement("tr", { key: index, className: this.styles.line },
                this.renderLine(left.lineNumber, left.type, LineNumberPrefix.LEFT, left.value, left.flattenPath),
                this.renderLine(right.lineNumber, right.type, LineNumberPrefix.RIGHT, right.value, right.flattenPath)));
        };
        this.renderInlineViewRow = (line, index) => {
            const { left, right } = line;
            if (left.type === DiffType.REMOVED && right.type === DiffType.ADDED) {
                return (React.createElement(React.Fragment, { key: index },
                    React.createElement("tr", { className: this.styles.line }, this.renderLine(left.lineNumber, left.type, LineNumberPrefix.LEFT, left.value, left.flattenPath)),
                    React.createElement("tr", { className: this.styles.line }, this.renderLine(null, right.type, LineNumberPrefix.RIGHT, right.value, right.flattenPath, right.lineNumber))));
            }
            let content;
            if (left.type === DiffType.REMOVED) {
                content = this.renderLine(left.lineNumber, left.type, LineNumberPrefix.LEFT, left.value, left.flattenPath, null);
            }
            else if (left.type === DiffType.DEFAULT) {
                content = this.renderLine(left.lineNumber, left.type, LineNumberPrefix.LEFT, left.value, left.flattenPath, right.lineNumber, LineNumberPrefix.RIGHT);
            }
            else if (right.type === DiffType.ADDED) {
                content = this.renderLine(null, right.type, LineNumberPrefix.RIGHT, right.value, right.flattenPath, right.lineNumber);
            }
            return (React.createElement("tr", { key: index, className: this.styles.line }, content));
        };
        this.renderVirtualizedDiff = () => {
            const lineCount = this.lineInformation.length;
            const isSmallDataset = lineCount <= 700;
            if (isSmallDataset) {
                return this.renderMinimapOptimizedDiff();
            }
            // For large datasets (>700 lines), use internal virtualized scrolling
            return this.renderInternalVirtualizedDiff();
        };
        this.renderInternalVirtualizedDiff = () => {
            const { virtualizedHeight } = this.props;
            return (React.createElement("div", { style: { height: virtualizedHeight || 600, overflow: 'auto' } },
                React.createElement(AutoSizer, null, ({ height, width }) => {
                    this.clearHeightsOnWidthChange(width);
                    const ListComponent = VariableSizeList;
                    return (React.createElement(ListComponent, { height: height, width: width, itemCount: this.lineInformation.length, itemSize: this.getRowHeight, ref: this.listRef, overscanCount: 5, estimatedItemSize: 40, layout: "vertical", key: `${width}-${height}` }, this.VirtualizedRow));
                })));
        };
        // Optimized rendering for minimap mode - renders all content but with performance optimizations
        this.renderMinimapOptimizedDiff = () => {
            // Use simpler rendering for better performance with large datasets
            const optimizedRows = this.lineInformation.map((line, index) => {
                const { left, right } = line;
                if (this.props.splitView) {
                    return (React.createElement("tr", { key: index, className: this.styles.line },
                        this.renderLine(left.lineNumber, left.type, LineNumberPrefix.LEFT, left.value, left.flattenPath),
                        this.renderLine(right.lineNumber, right.type, LineNumberPrefix.RIGHT, right.value, right.flattenPath)));
                }
                else {
                    if (left.type === DiffType.REMOVED && right.type === DiffType.ADDED) {
                        return (React.createElement(React.Fragment, { key: index },
                            React.createElement("tr", { className: this.styles.line }, this.renderLine(left.lineNumber, left.type, LineNumberPrefix.LEFT, left.value, left.flattenPath)),
                            React.createElement("tr", { className: this.styles.line }, this.renderLine(null, right.type, LineNumberPrefix.RIGHT, right.value, right.flattenPath, right.lineNumber))));
                    }
                    let content;
                    if (left.type === DiffType.REMOVED) {
                        content = this.renderLine(left.lineNumber, left.type, LineNumberPrefix.LEFT, left.value, left.flattenPath, null);
                    }
                    else if (left.type === DiffType.DEFAULT) {
                        content = this.renderLine(left.lineNumber, left.type, LineNumberPrefix.LEFT, left.value, left.flattenPath, right.lineNumber, LineNumberPrefix.RIGHT);
                    }
                    else if (right.type === DiffType.ADDED) {
                        content = this.renderLine(null, right.type, LineNumberPrefix.RIGHT, right.value, right.flattenPath, right.lineNumber);
                    }
                    return (React.createElement("tr", { key: index, className: this.styles.line }, content));
                }
            });
            return (React.createElement("div", { style: { overflow: 'visible', width: '100%' } },
                React.createElement("table", { className: cn(this.styles.diffContainer, {
                        [this.styles.splitView]: this.props.splitView,
                    }), style: {
                        width: '100%',
                        tableLayout: 'fixed',
                        wordBreak: 'break-word',
                        borderCollapse: 'separate',
                        borderSpacing: 0
                    } },
                    React.createElement("colgroup", null,
                        !this.props.hideLineNumbers && React.createElement("col", { style: { width: '50px', minWidth: '50px' } }),
                        !this.props.splitView && !this.props.hideLineNumbers && React.createElement("col", { style: { width: '50px', minWidth: '50px' } }),
                        this.props.renderGutter && React.createElement("col", { style: { width: '30px', minWidth: '30px' } }),
                        React.createElement("col", { style: { width: '30px', minWidth: '30px' } }),
                        React.createElement("col", { style: { width: 'auto' } }),
                        this.props.splitView && (React.createElement(React.Fragment, null,
                            !this.props.hideLineNumbers && React.createElement("col", { style: { width: '50px', minWidth: '50px' } }),
                            this.props.renderGutter && React.createElement("col", { style: { width: '30px', minWidth: '30px' } }),
                            React.createElement("col", { style: { width: '30px', minWidth: '30px' } }),
                            React.createElement("col", { style: { width: 'auto' } })))),
                    React.createElement("tbody", null, optimizedRows))));
        };
        this.renderSplitView = ({ left, right }, index) => {
            return (React.createElement("tr", { key: index, className: this.styles.line },
                this.renderLine(left.lineNumber, left.type, LineNumberPrefix.LEFT, left.value, left.flattenPath),
                this.renderLine(right.lineNumber, right.type, LineNumberPrefix.RIGHT, right.value, right.flattenPath)));
        };
        this.renderInlineView = ({ left, right }, index) => {
            if (left.type === DiffType.REMOVED && right.type === DiffType.ADDED) {
                return (React.createElement(React.Fragment, { key: index },
                    React.createElement("tr", { className: this.styles.line }, this.renderLine(left.lineNumber, left.type, LineNumberPrefix.LEFT, left.value, left.flattenPath)),
                    React.createElement("tr", { className: this.styles.line }, this.renderLine(null, right.type, LineNumberPrefix.RIGHT, right.value, right.flattenPath, right.lineNumber))));
            }
            let content;
            if (left.type === DiffType.REMOVED) {
                content = this.renderLine(left.lineNumber, left.type, LineNumberPrefix.LEFT, left.value, left.flattenPath, null);
            }
            if (left.type === DiffType.DEFAULT) {
                content = this.renderLine(left.lineNumber, left.type, LineNumberPrefix.LEFT, left.value, left.flattenPath, right.lineNumber, LineNumberPrefix.RIGHT);
            }
            if (right.type === DiffType.ADDED) {
                content = this.renderLine(null, right.type, LineNumberPrefix.RIGHT, right.value, right.flattenPath, right.lineNumber);
            }
            return (React.createElement("tr", { key: index, className: this.styles.line }, content));
        };
        this.onBlockClickProxy = (id) => () => this.onBlockExpand(id);
        this.renderSkippedLineIndicator = (num, blockNumber, leftBlockLineNumber, rightBlockLineNumber) => {
            const { hideLineNumbers, splitView } = this.props;
            const message = this.props.codeFoldMessageRenderer ? (this.props.codeFoldMessageRenderer(num, leftBlockLineNumber, rightBlockLineNumber)) : (React.createElement("pre", { className: this.styles.codeFoldContent },
                "Expand ",
                num,
                " lines ..."));
            const content = (React.createElement("td", null,
                React.createElement("a", { onClick: this.onBlockClickProxy(blockNumber), tabIndex: 0 }, message)));
            const isUnifiedViewWithoutLineNumbers = !splitView && !hideLineNumbers;
            return (React.createElement("tr", { key: `${leftBlockLineNumber}-${rightBlockLineNumber}`, className: this.styles.codeFold },
                !hideLineNumbers && React.createElement("td", { className: this.styles.codeFoldGutter }),
                this.props.renderGutter && React.createElement("td", { className: this.styles.codeFoldGutter, style: { background: 'transparent', border: 'none' } }),
                React.createElement("td", { className: cn({
                        [this.styles.codeFoldGutter]: isUnifiedViewWithoutLineNumbers,
                    }) }),
                isUnifiedViewWithoutLineNumbers ? (React.createElement(React.Fragment, null,
                    React.createElement("td", null),
                    content)) : (React.createElement(React.Fragment, null,
                    content,
                    this.props.renderGutter && React.createElement("td", null),
                    React.createElement("td", null))),
                React.createElement("td", null),
                React.createElement("td", null)));
        };
        this.renderDiff = () => {
            const { oldValue, newValue, noise, splitView, disableWordDiff, compareMethod, linesOffset, } = this.props;
            const { lineInformation, diffLines } = computeLineInformation(oldValue, newValue, noise, disableWordDiff, compareMethod, linesOffset);
            const extraLines = this.props.extraLinesSurroundingDiff < 0 ? 0 : this.props.extraLinesSurroundingDiff;
            let skippedLines = [];
            return lineInformation.map((line, i) => {
                const diffBlockStart = diffLines[0];
                const currentPosition = diffBlockStart - i;
                if (this.props.showDiffOnly) {
                    if (currentPosition === -extraLines) {
                        skippedLines = [];
                        diffLines.shift();
                    }
                    if (line.left.type === DiffType.DEFAULT &&
                        (currentPosition > extraLines || typeof diffBlockStart === 'undefined') &&
                        !this.state.expandedBlocks.includes(diffBlockStart)) {
                        skippedLines.push(i + 1);
                        if (i === lineInformation.length - 1 && skippedLines.length > 1) {
                            return this.renderSkippedLineIndicator(skippedLines.length, diffBlockStart, line.left.lineNumber, line.right.lineNumber);
                        }
                        return null;
                    }
                }
                const diffNodes = splitView
                    ? this.renderSplitView(line, i)
                    : this.renderInlineView(line, i);
                if (currentPosition === extraLines && skippedLines.length > 0) {
                    const { length } = skippedLines;
                    skippedLines = [];
                    return (React.createElement(React.Fragment, { key: i },
                        this.renderSkippedLineIndicator(length, diffBlockStart, line.left.lineNumber, line.right.lineNumber),
                        diffNodes));
                }
                return diffNodes;
            });
        };
        this.render = () => {
            const { oldValue, newValue, useDarkTheme, leftTitle, rightTitle, splitView, hideLineNumbers, enableVirtualization, disableWordDiff, compareMethod, linesOffset, noise, } = this.props;
            if (typeof oldValue !== 'string' || typeof newValue !== 'string') {
                throw Error('"oldValue" and "newValue" should be strings');
            }
            this.styles = this.computeStyles(this.props.styles, useDarkTheme);
            if (enableVirtualization) {
                const { lineInformation } = computeLineInformation(oldValue, newValue, noise, disableWordDiff, compareMethod, linesOffset);
                this.lineInformation = lineInformation;
            }
            const colSpanOnSplitView = hideLineNumbers ? 2 : 3;
            const colSpanOnInlineView = hideLineNumbers ? 2 : 4;
            let columnExtension = this.props.renderGutter ? 1 : 0;
            const title = (leftTitle || rightTitle) && (React.createElement("tr", null,
                React.createElement("td", { colSpan: (splitView ? colSpanOnSplitView : colSpanOnInlineView) + columnExtension, className: this.styles.titleBlock },
                    React.createElement("pre", { className: this.styles.contentText }, leftTitle)),
                splitView && (React.createElement("td", { colSpan: colSpanOnSplitView + columnExtension, className: this.styles.titleBlock },
                    React.createElement("pre", { className: this.styles.contentText }, rightTitle)))));
            if (enableVirtualization) {
                return (React.createElement("div", null,
                    title && (React.createElement("table", { className: cn(this.styles.diffContainer, {
                            [this.styles.splitView]: splitView,
                        }), style: { width: '100%' } },
                        React.createElement("tbody", null, title))),
                    this.renderVirtualizedDiff()));
            }
            const nodes = this.renderDiff();
            return (React.createElement("table", { className: cn(this.styles.diffContainer, {
                    [this.styles.splitView]: splitView,
                }), style: {
                    tableLayout: 'fixed',
                    borderCollapse: 'separate',
                    borderSpacing: 0,
                    width: '100%'
                } },
                React.createElement("colgroup", null,
                    !hideLineNumbers && React.createElement("col", { style: { width: '60px', minWidth: '60px' } }),
                    !splitView && !hideLineNumbers && React.createElement("col", { style: { width: '50px', minWidth: '50px' } }),
                    this.props.renderGutter && React.createElement("col", { style: { width: '30px', minWidth: '30px' } }),
                    React.createElement("col", { style: { width: '30px', minWidth: '30px' } }),
                    React.createElement("col", { style: { width: 'auto' } }),
                    splitView && (React.createElement(React.Fragment, null,
                        !hideLineNumbers && React.createElement("col", { style: { width: '50px', minWidth: '50px' } }),
                        this.props.renderGutter && React.createElement("col", { style: { width: '30px', minWidth: '30px' } }),
                        React.createElement("col", { style: { width: '30px', minWidth: '30px' } }),
                        React.createElement("col", { style: { width: 'auto' } })))),
                React.createElement("tbody", null,
                    title,
                    nodes)));
        };
        this.state = {
            expandedBlocks: [],
        };
    }
    componentDidUpdate(prevProps) {
        if (!!prevProps.renderGutter !== !!this.props.renderGutter) {
            this.itemHeights = {};
            if (this.listRef.current) {
                this.listRef.current.resetAfterIndex(0);
            }
        }
    }
}
DiffViewer.defaultProps = {
    oldValue: '',
    newValue: '',
    noise: [],
    splitView: true,
    highlightLines: [],
    disableWordDiff: false,
    compareMethod: DiffMethod.CHARS,
    styles: {},
    hideLineNumbers: false,
    extraLinesSurroundingDiff: 3,
    showDiffOnly: true,
    useDarkTheme: false,
    linesOffset: 0,
    enableVirtualization: false,
    virtualizedHeight: 600,
};
DiffViewer.propTypes = {
    oldValue: PropTypes.string.isRequired,
    newValue: PropTypes.string.isRequired,
    noise: PropTypes.arrayOf(PropTypes.string),
    splitView: PropTypes.bool,
    disableWordDiff: PropTypes.bool,
    compareMethod: PropTypes.oneOfType([PropTypes.oneOf(Object.values(DiffMethod)), PropTypes.func]),
    renderContent: PropTypes.func,
    onLineNumberClick: PropTypes.func,
    extraLinesSurroundingDiff: PropTypes.number,
    styles: PropTypes.object,
    hideLineNumbers: PropTypes.bool,
    showDiffOnly: PropTypes.bool,
    highlightLines: PropTypes.arrayOf(PropTypes.string),
    leftTitle: PropTypes.oneOfType([PropTypes.string, PropTypes.element]),
    rightTitle: PropTypes.oneOfType([PropTypes.string, PropTypes.element]),
    linesOffset: PropTypes.number,
    enableVirtualization: PropTypes.bool,
    virtualizedHeight: PropTypes.number,
};
export default DiffViewer;
export { DiffMethod };
