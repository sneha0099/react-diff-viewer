import * as React from 'react';
import * as PropTypes from 'prop-types';
import cn from 'classnames';
import { Change } from 'diff';
import { VariableSizeList, ListChildComponentProps } from 'react-window';
import AutoSizer from 'react-virtualized-auto-sizer';

import {
  computeLineInformation,
  LineInformation,
  DiffInformation,
  DiffType,
  DiffMethod,
} from './compute-lines';
import computeStyles, {
  ReactDiffViewerStyles,
  ReactDiffViewerStylesOverride,
} from './styles';

const m = require('memoize-one');
const memoize = m.default || m;

export enum LineNumberPrefix {
  LEFT = 'L',
  RIGHT = 'R',
}

export interface ReactDiffViewerProps {
  oldValue: string;
  newValue: string;
  noise: string[];
  splitView?: boolean;
  linesOffset?: number;
  disableWordDiff?: boolean;
  compareMethod?: DiffMethod | ((oldStr: string, newStr: string) => Change[]);
  extraLinesSurroundingDiff?: number;
  hideLineNumbers?: boolean;
  showDiffOnly?: boolean;
  renderContent?: (source: string) => JSX.Element;
  codeFoldMessageRenderer?: (
    totalFoldedLines: number,
    leftStartLineNumber: number,
    rightStartLineNumber: number,
  ) => JSX.Element;
  onLineNumberClick?: (
    lineId: string,
    event: React.MouseEvent<HTMLTableCellElement>,
  ) => void;
  renderGutter?: (data: {
    lineNumber: number;
    type: DiffType;
    prefix: LineNumberPrefix;
    value: string | DiffInformation[];
    additionalLineNumber: number;
    additionalPrefix: LineNumberPrefix;
    styles: ReactDiffViewerStyles;
    flattenPath: string;
  }) => JSX.Element;
  highlightLines?: string[];
  styles?: ReactDiffViewerStylesOverride;
  useDarkTheme?: boolean;
  leftTitle?: string | JSX.Element;
  rightTitle?: string | JSX.Element;
  enableVirtualization?: boolean;
  virtualizedHeight?: number;
}

export interface ReactDiffViewerState {
  expandedBlocks?: number[];
}

class DiffViewer extends React.Component<ReactDiffViewerProps, ReactDiffViewerState> {
  private styles: ReactDiffViewerStyles;
  private listRef = React.createRef<VariableSizeList>();
  private itemHeights: { [key: number]: number } = {};
  private lineInformation: LineInformation[] = [];
  private processedLines: any[] = [];
  private lastContainerWidth: number = 0;

  public static defaultProps: ReactDiffViewerProps = {
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

  public static propTypes = {
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

  public constructor(props: ReactDiffViewerProps) {
    super(props);

    this.state = {
      expandedBlocks: [],
    };
  }

  public componentDidUpdate(prevProps: ReactDiffViewerProps): void {
    if (!!prevProps.renderGutter !== !!this.props.renderGutter) {
      this.itemHeights = {};
      if (this.listRef.current) {
        this.listRef.current.resetAfterIndex(0);
      }
    }
  }

  public resetCodeBlocks = (): boolean => {
    if (this.state.expandedBlocks.length > 0) {
      this.setState({
        expandedBlocks: [],
      });
      return true;
    }
    return false;
  };

  private onBlockExpand = (id: number): void => {
    const prevState = this.state.expandedBlocks.slice();
    prevState.push(id);

    this.setState({
      expandedBlocks: prevState,
    });
  };

  private computeStyles: (
    styles: ReactDiffViewerStylesOverride,
    useDarkTheme: boolean,
  ) => ReactDiffViewerStyles = memoize(computeStyles);

  private onLineNumberClickProxy = (id: string): any => {
    if (this.props.onLineNumberClick) {
      return (e: any): void => this.props.onLineNumberClick(id, e);
    }
    return (): void => {};
  };

  private renderWordDiff = (
    diffArray: DiffInformation[],
    renderer?: (chunk: string) => JSX.Element,
  ): JSX.Element[] => {
    return diffArray.map((wordDiff, i): JSX.Element => {
      return (
        <span
          key={i}
          className={cn(this.styles.wordDiff, {
            [this.styles.wordAdded]: wordDiff.type === DiffType.ADDED,
            [this.styles.wordRemoved]: wordDiff.type === DiffType.REMOVED,
            [this.styles.wordNoised]: wordDiff.type === DiffType.NOISED,
          })}
          data-flattenpath={wordDiff.flattenPath || ''}
        >
          {renderer ? renderer(wordDiff.value as string) : wordDiff.value}
        </span>
      );
    });
  };

  private renderLine = (
    lineNumber: number,
    type: DiffType,
    prefix: LineNumberPrefix,
    value: string | DiffInformation[],
    flattenPath?: string,
    additionalLineNumber?: number,
    additionalPrefix?: LineNumberPrefix,
  ): JSX.Element => {
    const lineNumberTemplate = `${prefix}-${lineNumber}`;
    const additionalLineNumberTemplate = `${additionalPrefix}-${additionalLineNumber}`;
    const highlightLine =
      this.props.highlightLines.includes(lineNumberTemplate) ||
      this.props.highlightLines.includes(additionalLineNumberTemplate);
    const added = type === DiffType.ADDED;
    const removed = type === DiffType.REMOVED;
    const noised = type === DiffType.NOISED;
    let content;
    if (Array.isArray(value)) {
      content = this.renderWordDiff(value, this.props.renderContent);
    } else if (this.props.renderContent) {
      content = this.props.renderContent(value);
    } else {
      content = value;
    }

    return (
      <React.Fragment>
        {!this.props.hideLineNumbers && (
          <td
            onClick={lineNumber && this.onLineNumberClickProxy(lineNumberTemplate)}
            className={cn(this.styles.gutter, {
              [this.styles.emptyGutter]: !lineNumber,
              [this.styles.highlightedGutter]: highlightLine,
            })}
            data-flattenpath={flattenPath || ''}
            style={{
              verticalAlign: 'middle',
              padding: 0,
              height: '100%',
              background: '#f4f4f4', // always grey
              width: '100%',
            }}
          >
            <div style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              height: '100%',
              width: '100%',
            }}>
              <pre className={this.styles.lineNumber} style={{
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
              }}>{lineNumber}</pre>
            </div>
          </td>
        )}
        {!this.props.splitView && !this.props.hideLineNumbers && (
          <td
            onClick={
              additionalLineNumber && this.onLineNumberClickProxy(additionalLineNumberTemplate)
            }
            className={cn(this.styles.gutter, {
              [this.styles.emptyGutter]: !additionalLineNumber,
              [this.styles.diffAdded]: added,
              [this.styles.diffRemoved]: removed,
              [this.styles.diffNoised]: noised,
              [this.styles.highlightedGutter]: highlightLine,
            })}
            data-flattenpath={flattenPath || ''}
            style={{ verticalAlign: 'top' }}
          >
            <pre className={this.styles.lineNumber}>{additionalLineNumber}</pre>
          </td>
        )}
        {this.props.renderGutter && (
          <td 
            className={this.styles.gutter} 
            data-flattenpath={flattenPath || ''}
            style={{ 
              verticalAlign: 'middle',
              minWidth: '30px',
              width: '30px',
              textAlign: 'center',
              padding: '0',
              margin: '0',
              background: 'transparent',
              border: 'none',
              lineHeight: 'inherit'
            }}
          >
            {this.props.renderGutter({
              lineNumber,
              type,
              prefix,
              value,
              additionalLineNumber,
              additionalPrefix,
              styles: this.styles,
              flattenPath: flattenPath || '',
            })}
          </td>
        )}
        <td
          className={cn(this.styles.marker, {
            [this.styles.emptyLine]: !content,
            [this.styles.diffAdded]: added,
            [this.styles.diffRemoved]: removed,
            [this.styles.diffNoised]: noised,
            [this.styles.highlightedLine]: highlightLine,
          })}
          data-flattenpath={flattenPath || ''}
          style={{ 
            verticalAlign: 'middle',
            textAlign: 'center',
            padding: '0',
            lineHeight: 'inherit'
          }}
        >
          <pre style={{ margin: '0', padding: '0', lineHeight: 'inherit' }}>
            {added && '+'}
            {removed && '-'}
          </pre>
        </td>
        <td
          className={cn(this.styles.content, {
            [this.styles.emptyLine]: !content,
            [this.styles.diffAdded]: added,
            [this.styles.diffRemoved]: removed,
            [this.styles.diffNoised]: noised,
            [this.styles.highlightedLine]: highlightLine,
          })}
          data-flattenpath={flattenPath || ''}
          style={{ verticalAlign: 'top' }}
        >
          <pre
            className={cn(this.styles.contentText, {
              [this.styles.wordNoised]: noised,
            })}
          >
            {content}
          </pre>
        </td>
      </React.Fragment>
    );
  };

  // Get row height for virtualization
  private getRowHeight = (index: number): number => {
    if (this.itemHeights[index]) {
      return this.itemHeights[index];
    }

    const line = this.lineInformation[index];
    if (!line) return 32;
    
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

  private setRowHeight = (index: number, size: number) => {
    if (this.itemHeights[index] !== size) {
      this.itemHeights[index] = size;
      if (this.listRef.current) {
        this.listRef.current.resetAfterIndex(index);
      }
    }
  };

  private clearHeightsOnWidthChange = (newWidth: number) => {
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
  private VirtualizedRow = ({ index, style }: ListChildComponentProps) => {
    const rowRef = React.useRef<HTMLDivElement>(null);
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
      const handleInteraction = (e: Event) => {
        const target = e.target as HTMLElement;
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
    if (!line) return null;

    const { splitView } = this.props;

    const estimatedHeight = this.getRowHeight(index);
    
    return (
      <div 
        key={`row-${index}-${forceUpdate}-${!!this.props.renderGutter}`} 
        style={{
          ...style,
          minHeight: Math.max(32, estimatedHeight), 
          height: 'auto', 
        }} 
        ref={rowRef}
      >
        <table 
          className={cn(this.styles.diffContainer, {
            [this.styles.splitView]: splitView,
          })}
          style={{ 
            width: '100%', 
            tableLayout: 'fixed',
            wordBreak: 'break-word',
            borderCollapse: 'separate',
            borderSpacing: 0
          }}
        >
          <colgroup>
            {!this.props.hideLineNumbers && <col style={{ width: '50px', minWidth: '50px' }} />}
            {!this.props.splitView && !this.props.hideLineNumbers && <col style={{ width: '50px', minWidth: '50px' }} />}
            {this.props.renderGutter && <col style={{ width: '30px', minWidth: '30px' }} />}
            <col style={{ width: '30px', minWidth: '30px' }} />
            <col style={{ width: 'auto' }} />
            {this.props.splitView && (
              <>
                {!this.props.hideLineNumbers && <col style={{ width: '50px', minWidth: '50px' }} />}
                {this.props.renderGutter && <col style={{ width: '30px', minWidth: '30px' }} />}
                <col style={{ width: '30px', minWidth: '30px' }} />
                <col style={{ width: 'auto' }} />
              </>
            )}
          </colgroup>
          <tbody>
            {splitView ? this.renderSplitViewRow(line, index) : this.renderInlineViewRow(line, index)}
          </tbody>
        </table>
      </div>
    );
  };

  private renderSplitViewRow = (line: LineInformation, index: number): JSX.Element => {
    const { left, right } = line;
    return (
      <tr key={index} className={this.styles.line}>
        {this.renderLine(
          left.lineNumber,
          left.type,
          LineNumberPrefix.LEFT,
          left.value,
          left.flattenPath,
        )}
        {this.renderLine(
          right.lineNumber,
          right.type,
          LineNumberPrefix.RIGHT,
          right.value,
          right.flattenPath,
        )}
      </tr>
    );
  };

  private renderInlineViewRow = (line: LineInformation, index: number): JSX.Element | React.ReactFragment => {
    const { left, right } = line;
    
    if (left.type === DiffType.REMOVED && right.type === DiffType.ADDED) {
      return (
        <React.Fragment key={index}>
          <tr className={this.styles.line}>
            {this.renderLine(
              left.lineNumber,
              left.type,
              LineNumberPrefix.LEFT,
              left.value,
              left.flattenPath,
            )}
          </tr>
          <tr className={this.styles.line}>
            {this.renderLine(
              null,
              right.type,
              LineNumberPrefix.RIGHT,
              right.value,
              right.flattenPath,
              right.lineNumber,
            )}
          </tr>
        </React.Fragment>
      );
    }

    let content;
    if (left.type === DiffType.REMOVED) {
      content = this.renderLine(
        left.lineNumber,
        left.type,
        LineNumberPrefix.LEFT,
        left.value,
        left.flattenPath,
        null,
      );
    } else if (left.type === DiffType.DEFAULT) {
      content = this.renderLine(
        left.lineNumber,
        left.type,
        LineNumberPrefix.LEFT,
        left.value,
        left.flattenPath,
        right.lineNumber,
        LineNumberPrefix.RIGHT,
      );
    } else if (right.type === DiffType.ADDED) {
      content = this.renderLine(
        null,
        right.type,
        LineNumberPrefix.RIGHT,
        right.value,
        right.flattenPath,
        right.lineNumber,
      );
    }

    return (
      <tr key={index} className={this.styles.line}>
        {content}
      </tr>
    );
  };

  private renderVirtualizedDiff = (): JSX.Element => {
    const lineCount = this.lineInformation.length;
    const isSmallDataset = lineCount <= 2500;

    if (isSmallDataset) {
      return this.renderMinimapOptimizedDiff();
    }

    // For large datasets (>2500 lines), use internal virtualized scrolling
    return this.renderInternalVirtualizedDiff();
  };

  
  private renderInternalVirtualizedDiff = (): JSX.Element => {
    const { virtualizedHeight } = this.props;
    
    return (
      <div style={{ height: virtualizedHeight || 600, overflow: 'auto' }}>
        <AutoSizer>
          {({ height, width }: { height: number; width: number }) => {
            
            this.clearHeightsOnWidthChange(width);
            
            const ListComponent = VariableSizeList as any;
            return (
              <ListComponent
                height={height}
                width={width}
                itemCount={this.lineInformation.length}
                itemSize={this.getRowHeight}
                ref={this.listRef}
                overscanCount={5} // Show a few extra items for smooth scrolling
                estimatedItemSize={40}
                layout="vertical"
                key={`${width}-${height}`} // Force re-render on size change
              >
                {this.VirtualizedRow}
              </ListComponent>
            );
          }}
        </AutoSizer>
      </div>
    );
  };

  // Optimized rendering for minimap mode - renders all content but with performance optimizations
  private renderMinimapOptimizedDiff = (): JSX.Element => {
    // Use simpler rendering for better performance with large datasets
    const optimizedRows = this.lineInformation.map((line, index) => {
      const { left, right } = line;
      
      if (this.props.splitView) {
        return (
          <tr key={index} className={this.styles.line}>
            {this.renderLine(
              left.lineNumber,
              left.type,
              LineNumberPrefix.LEFT,
              left.value,
              left.flattenPath,
            )}
            {this.renderLine(
              right.lineNumber,
              right.type,
              LineNumberPrefix.RIGHT,
              right.value,
              right.flattenPath,
            )}
          </tr>
        );
      } else {
        
        if (left.type === DiffType.REMOVED && right.type === DiffType.ADDED) {
          return (
            <React.Fragment key={index}>
              <tr className={this.styles.line}>
                {this.renderLine(
                  left.lineNumber,
                  left.type,
                  LineNumberPrefix.LEFT,
                  left.value,
                  left.flattenPath,
                )}
              </tr>
              <tr className={this.styles.line}>
                {this.renderLine(
                  null,
                  right.type,
                  LineNumberPrefix.RIGHT,
                  right.value,
                  right.flattenPath,
                  right.lineNumber,
                )}
              </tr>
            </React.Fragment>
          );
        }

        let content;
        if (left.type === DiffType.REMOVED) {
          content = this.renderLine(
            left.lineNumber,
            left.type,
            LineNumberPrefix.LEFT,
            left.value,
            left.flattenPath,
            null,
          );
        } else if (left.type === DiffType.DEFAULT) {
          content = this.renderLine(
            left.lineNumber,
            left.type,
            LineNumberPrefix.LEFT,
            left.value,
            left.flattenPath,
            right.lineNumber,
            LineNumberPrefix.RIGHT,
          );
        } else if (right.type === DiffType.ADDED) {
          content = this.renderLine(
            null,
            right.type,
            LineNumberPrefix.RIGHT,
            right.value,
            right.flattenPath,
            right.lineNumber,
          );
        }

        return (
          <tr key={index} className={this.styles.line}>
            {content}
          </tr>
        );
      }
    });

    return (
      <div style={{ overflow: 'visible', width: '100%' }}>
        <table 
          className={cn(this.styles.diffContainer, {
            [this.styles.splitView]: this.props.splitView,
          })}
          style={{ 
            width: '100%', 
            tableLayout: 'fixed',
            wordBreak: 'break-word',
            borderCollapse: 'separate',
            borderSpacing: 0
          }}
        >
          <colgroup>
            {!this.props.hideLineNumbers && <col style={{ width: '50px', minWidth: '50px' }} />}
            {!this.props.splitView && !this.props.hideLineNumbers && <col style={{ width: '50px', minWidth: '50px' }} />}
            {this.props.renderGutter && <col style={{ width: '30px', minWidth: '30px' }} />}
            <col style={{ width: '30px', minWidth: '30px' }} />
            <col style={{ width: 'auto' }} />
            {this.props.splitView && (
              <>
                {!this.props.hideLineNumbers && <col style={{ width: '50px', minWidth: '50px' }} />}
                {this.props.renderGutter && <col style={{ width: '30px', minWidth: '30px' }} />}
                <col style={{ width: '30px', minWidth: '30px' }} />
                <col style={{ width: 'auto' }} />
              </>
            )}
          </colgroup>
          <tbody>
            {optimizedRows}
          </tbody>
        </table>
      </div>
    );
  };

  private renderSplitView = ({ left, right }: LineInformation, index: number): JSX.Element => {
    return (
      <tr key={index} className={this.styles.line}>
        {this.renderLine(
          left.lineNumber,
          left.type,
          LineNumberPrefix.LEFT,
          left.value,
          left.flattenPath,
        )}
        {this.renderLine(
          right.lineNumber,
          right.type,
          LineNumberPrefix.RIGHT,
          right.value,
          right.flattenPath,
        )}
      </tr>
    );
  };

  public renderInlineView = ({ left, right }: LineInformation, index: number): JSX.Element => {
    if (left.type === DiffType.REMOVED && right.type === DiffType.ADDED) {
      return (
        <React.Fragment key={index}>
          <tr className={this.styles.line}>
            {this.renderLine(
              left.lineNumber,
              left.type,
              LineNumberPrefix.LEFT,
              left.value,
              left.flattenPath,
            )}
          </tr>
          <tr className={this.styles.line}>
            {this.renderLine(
              null,
              right.type,
              LineNumberPrefix.RIGHT,
              right.value,
              right.flattenPath,
              right.lineNumber,
            )}
          </tr>
        </React.Fragment>
      );
    }

    let content;
    if (left.type === DiffType.REMOVED) {
      content = this.renderLine(
        left.lineNumber,
        left.type,
        LineNumberPrefix.LEFT,
        left.value,
        left.flattenPath,
        null,
      );
    }
    if (left.type === DiffType.DEFAULT) {
      content = this.renderLine(
        left.lineNumber,
        left.type,
        LineNumberPrefix.LEFT,
        left.value,
        left.flattenPath,
        right.lineNumber,
        LineNumberPrefix.RIGHT,
      );
    }
    if (right.type === DiffType.ADDED) {
      content = this.renderLine(
        null,
        right.type,
        LineNumberPrefix.RIGHT,
        right.value,
        right.flattenPath,
        right.lineNumber,
      );
    }

    return (
      <tr key={index} className={this.styles.line}>
        {content}
      </tr>
    );
  };

  private onBlockClickProxy =
    (id: number): any =>
    (): void =>
      this.onBlockExpand(id);

  private renderSkippedLineIndicator = (
    num: number,
    blockNumber: number,
    leftBlockLineNumber: number,
    rightBlockLineNumber: number,
  ): JSX.Element => {
    const { hideLineNumbers, splitView } = this.props;
    const message = this.props.codeFoldMessageRenderer ? (
      this.props.codeFoldMessageRenderer(num, leftBlockLineNumber, rightBlockLineNumber)
    ) : (
      <pre className={this.styles.codeFoldContent}>Expand {num} lines ...</pre>
    );
    const content = (
      <td>
        <a onClick={this.onBlockClickProxy(blockNumber)} tabIndex={0}>
          {message}
        </a>
      </td>
    );
    const isUnifiedViewWithoutLineNumbers = !splitView && !hideLineNumbers;
    return (
      <tr
        key={`${leftBlockLineNumber}-${rightBlockLineNumber}`}
        className={this.styles.codeFold}
      >
        {!hideLineNumbers && <td className={this.styles.codeFoldGutter} />}
        {this.props.renderGutter && <td className={this.styles.codeFoldGutter} style={{ background: 'transparent', border: 'none' }} />}
        <td
          className={cn({
            [this.styles.codeFoldGutter]: isUnifiedViewWithoutLineNumbers,
          })}
        />

        {isUnifiedViewWithoutLineNumbers ? (
          <React.Fragment>
            <td />
            {content}
          </React.Fragment>
        ) : (
          <React.Fragment>
            {content}
            {this.props.renderGutter && <td />}
            <td />
          </React.Fragment>
        )}

        <td />
        <td />
      </tr>
    );
  };

  private renderDiff = (): JSX.Element[] => {
    const {
      oldValue,
      newValue,
      noise,
      splitView,
      disableWordDiff,
      compareMethod,
      linesOffset,
    } = this.props;
    const { lineInformation, diffLines } = computeLineInformation(
      oldValue,
      newValue,
      noise,
      disableWordDiff,
      compareMethod,
      linesOffset,
    );

    const extraLines =
      this.props.extraLinesSurroundingDiff < 0 ? 0 : this.props.extraLinesSurroundingDiff;
    let skippedLines: number[] = [];
    return lineInformation.map((line: LineInformation, i: number): JSX.Element => {
      const diffBlockStart = diffLines[0];
      const currentPosition = diffBlockStart - i;
      if (this.props.showDiffOnly) {
        if (currentPosition === -extraLines) {
          skippedLines = [];
          diffLines.shift();
        }
        if (
          line.left.type === DiffType.DEFAULT &&
          (currentPosition > extraLines || typeof diffBlockStart === 'undefined') &&
          !this.state.expandedBlocks.includes(diffBlockStart)
        ) {
          skippedLines.push(i + 1);
          if (i === lineInformation.length - 1 && skippedLines.length > 1) {
            return this.renderSkippedLineIndicator(
              skippedLines.length,
              diffBlockStart,
              line.left.lineNumber,
              line.right.lineNumber,
            );
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
        return (
          <React.Fragment key={i}>
            {this.renderSkippedLineIndicator(
              length,
              diffBlockStart,
              line.left.lineNumber,
              line.right.lineNumber,
            )}
            {diffNodes}
          </React.Fragment>
        );
      }
      return diffNodes;
    });
  };

  public render = (): JSX.Element => {
    const {
      oldValue,
      newValue,
      useDarkTheme,
      leftTitle,
      rightTitle,
      splitView,
      hideLineNumbers,
      enableVirtualization,
      disableWordDiff,
      compareMethod,
      linesOffset,
      noise,
    } = this.props;

    if (typeof oldValue !== 'string' || typeof newValue !== 'string') {
      throw Error('"oldValue" and "newValue" should be strings');
    }

    this.styles = this.computeStyles(this.props.styles, useDarkTheme);
    
    if (enableVirtualization) {
      const { lineInformation } = computeLineInformation(
        oldValue,
        newValue,
        noise,
        disableWordDiff,
        compareMethod,
        linesOffset,
      );
      this.lineInformation = lineInformation;
    }

    const colSpanOnSplitView = hideLineNumbers ? 2 : 3;
    const colSpanOnInlineView = hideLineNumbers ? 2 : 4;
    let columnExtension = this.props.renderGutter ? 1 : 0;

    const title = (leftTitle || rightTitle) && (
      <tr>
        <td
          colSpan={
            (splitView ? colSpanOnSplitView : colSpanOnInlineView) + columnExtension
          }
          className={this.styles.titleBlock}
        >
          <pre className={this.styles.contentText}>{leftTitle}</pre>
        </td>
        {splitView && (
          <td
            colSpan={colSpanOnSplitView + columnExtension}
            className={this.styles.titleBlock}
          >
            <pre className={this.styles.contentText}>{rightTitle}</pre>
          </td>
        )}
      </tr>
    );

    if (enableVirtualization) {
      return (
        <div>
          {title && (
            <table
              className={cn(this.styles.diffContainer, {
                [this.styles.splitView]: splitView,
              })}
              style={{ width: '100%' }}
            >
              <tbody>{title}</tbody>
            </table>
          )}
          {this.renderVirtualizedDiff()}
        </div>
      );
    }

    const nodes = this.renderDiff();
    
    return (
      <table
        className={cn(this.styles.diffContainer, {
          [this.styles.splitView]: splitView,
        })}
        style={{
          tableLayout: 'fixed',
          borderCollapse: 'separate',
          borderSpacing: 0,
          width: '100%'
        }}
      >
        <colgroup>
          {!hideLineNumbers && <col style={{ width: '60px', minWidth: '60px' }} />}
          {!splitView && !hideLineNumbers && <col style={{ width: '50px', minWidth: '50px' }} />}
          {this.props.renderGutter && <col style={{ width: '30px', minWidth: '30px' }} />}
          <col style={{ width: '30px', minWidth: '30px' }} />
          <col style={{ width: 'auto' }} />
          {splitView && (
            <>
              {!hideLineNumbers && <col style={{ width: '50px', minWidth: '50px' }} />}
              {this.props.renderGutter && <col style={{ width: '30px', minWidth: '30px' }} />}
              <col style={{ width: '30px', minWidth: '30px' }} />
              <col style={{ width: 'auto' }} />
            </>
          )}
        </colgroup>
        <tbody>
          {title}
          {nodes}
        </tbody>
      </table>
    );
  };
}

export default DiffViewer;
export { ReactDiffViewerStylesOverride, DiffMethod };