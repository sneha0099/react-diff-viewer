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
  };

  public constructor(props: ReactDiffViewerProps) {
    super(props);

    this.state = {
      expandedBlocks: [],
    };
    
    // Ensure clean initialization
    this.itemHeights = {};
    this.lastContainerWidth = 0;
  }

  public componentDidUpdate(prevProps: ReactDiffViewerProps): void {
    // Clear height cache when renderGutter changes
    if (!!prevProps.renderGutter !== !!this.props.renderGutter) {
      this.forceResetAllHeights();
    }

    // Clear height cache when noise array changes (mark noise mode toggle)
    if (JSON.stringify(prevProps.noise) !== JSON.stringify(this.props.noise)) {
      this.forceResetAllHeights();
    }

    // Clear height cache when content changes (oldValue/newValue)
    if (prevProps.oldValue !== this.props.oldValue || prevProps.newValue !== this.props.newValue) {
      this.forceResetAllHeights();
    }

    // Clear height cache when split view mode changes
    if (prevProps.splitView !== this.props.splitView) {
      this.forceResetAllHeights();
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
              verticalAlign: 'top',
              padding: 0,
              margin: 0,
              background: '#f4f4f4', // always grey
              width: '50px',
              minWidth: '50px',
              textAlign: 'center',
              borderRight: '1px solid #ddd',
            }}
          >
            <pre className={this.styles.lineNumber} style={{
              textAlign: 'center',
              fontVariantNumeric: 'tabular-nums',
              minWidth: 48,
              margin: 0,
              padding: '2px 4px',
              background: 'transparent',
              lineHeight: '22px',
              boxSizing: 'border-box',
            }}>{lineNumber}</pre>
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
            style={{ 
              verticalAlign: 'top',
              padding: 0,
              margin: 0,
              background: '#f4f4f4',
              width: '50px',
              minWidth: '50px',
              textAlign: 'center',
              borderRight: '1px solid #ddd',
            }}
          >
            <pre className={this.styles.lineNumber} style={{
              textAlign: 'center',
              fontVariantNumeric: 'tabular-nums',
              minWidth: 48,
              margin: 0,
              padding: '2px 4px',
              background: 'transparent',
              lineHeight: '22px',
              boxSizing: 'border-box',
            }}>{additionalLineNumber}</pre>
          </td>
        )}
        {this.props.renderGutter && (
          <td 
            className={this.styles.gutter} 
            data-flattenpath={flattenPath || ''}
            style={{ 
              verticalAlign: 'top',
              minWidth: '30px',
              width: '30px',
              textAlign: 'center',
              padding: '0',
              margin: '0',
              background: 'transparent',
              border: 'none',
              lineHeight: '22px',
              position: 'relative',
            }}
          >
            <div style={{
              position: 'absolute',
              top: '50%',
              left: '50%',
              transform: 'translate(-50%, -50%)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              width: '20px',
              height: '20px',
              zIndex: 1,
            }}>
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
            </div>
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
    if (!line) return 28;
    
    // Calculate a more accurate estimate for long content
    const leftContent = Array.isArray(line.left.value) 
      ? line.left.value.map(v => v.value).join('') 
      : line.left.value || '';
    const rightContent = Array.isArray(line.right.value) 
      ? line.right.value.map(v => v.value).join('') 
      : line.right.value || '';
    
    const maxLength = Math.max(leftContent.length, rightContent.length);
    
    // Base height for short content
    if (maxLength <= 100) {
      return 28;
    }
    
    // Estimate additional height for longer content
    const estimatedCharsPerLine = this.props.splitView ? 80 : 120;
    const estimatedLines = Math.ceil(maxLength / estimatedCharsPerLine);
    const lineHeight = 22;
    const baseHeight = 28;
    
    // Add height for additional lines
    const totalHeight = baseHeight + (Math.max(0, estimatedLines - 1) * lineHeight);
    
    // Cap maximum height to prevent extreme cases, but be generous for content
    return Math.min(300, totalHeight); // Increased to 300 to prevent content trimming
  };

  private setRowHeight = (index: number, size: number) => {
    // Cache the actual measured height
    if (this.itemHeights[index] !== size && size > 0) {
      this.itemHeights[index] = size;
      if (this.listRef.current) {
        this.listRef.current.resetAfterIndex(index);
      }
    }
  };

  private forceResetAllHeights = () => {
    this.itemHeights = {};
    this.lastContainerWidth = 0;
    if (this.listRef.current) {
      this.listRef.current.resetAfterIndex(0);
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

  // Virtualized row renderer with title support
  private VirtualizedRowWithTitle = ({ index, style }: ListChildComponentProps) => {
    const { leftTitle, rightTitle, splitView, hideLineNumbers } = this.props;
    const hasTitle = leftTitle || rightTitle;
    
    // If we have a title and this is the first row, render the title
    if (hasTitle && index === 0) {
      const colSpanOnSplitView = hideLineNumbers ? 2 : 3;
      const colSpanOnInlineView = hideLineNumbers ? 2 : 4;
      let columnExtension = this.props.renderGutter ? 1 : 0;
      
      return (
        <div style={{...style, margin: 0, padding: 0}}>
          <table
            className={cn(this.styles.diffContainer, {
              [this.styles.splitView]: splitView,
            })}
            style={{
              width: '100%',
              tableLayout: 'fixed',
              wordBreak: 'break-word',
              borderCollapse: 'collapse',
              borderSpacing: 0,
              height: '100%',
              marginBottom: 0,
            }}
          >
            <colgroup>
              {!hideLineNumbers && <col style={{ width: '50px', minWidth: '50px' }} />}
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
              <tr>
                <td
                  colSpan={
                    (splitView ? colSpanOnSplitView : colSpanOnInlineView) + columnExtension
                  }
                  className={this.styles.titleBlock}
                  style={{ textAlign: 'center' }}
                >
                  <pre className={this.styles.contentText} style={{ textAlign: 'center', margin: 0 }}>{leftTitle}</pre>
                </td>
                {splitView && (
                  <td
                    colSpan={colSpanOnSplitView + columnExtension}
                    className={this.styles.titleBlock}
                    style={{ textAlign: 'center' }}
                  >
                    <pre className={this.styles.contentText} style={{ textAlign: 'center', margin: 0 }}>{rightTitle}</pre>
                  </td>
                )}
              </tr>
            </tbody>
          </table>
        </div>
      );
    }
    
    // For regular rows, adjust the index and render the line
    const lineIndex = hasTitle ? index - 1 : index;
    const line = this.lineInformation[lineIndex];
    if (!line) return null;
    const rowRef = React.useRef<HTMLDivElement>(null);
    const [forceUpdate, setForceUpdate] = React.useState(0);
    
    React.useEffect(() => {
      if (rowRef.current) {
        const height = rowRef.current.getBoundingClientRect().height;
        
        // When renderGutter (checkbox mode) is active, still allow content expansion
        // but be more careful about when to cache heights
        const hasGutter = !!this.props.renderGutter;
        
        if (hasGutter) {
          // In checkbox mode, allow height expansion but be more conservative about caching
          const threshold = 2; // Small threshold to prevent noise from checkbox interactions
          if (Math.abs((this.itemHeights[lineIndex] || 0) - height) > threshold && height > 0) {
            // Allow heights up to reasonable limits, don't restrict content
            if (height <= 300) { // Generous limit to match getRowHeight
              this.setRowHeight(lineIndex, height);
            }
          }
        } else {
          // In normal mode, use flexible height caching
          if (Math.abs((this.itemHeights[lineIndex] || 0) - height) > 1 && height > 0 && height <= 300) {
            this.setRowHeight(lineIndex, height);
          }
        }
      }
    });

    React.useEffect(() => {
      const handleInteraction = (e: Event) => {
        const target = e.target as HTMLElement;
        // Only trigger updates for form elements that actually change content
        if (target.tagName === 'INPUT' && target.getAttribute('type') !== 'checkbox') {
          setTimeout(() => setForceUpdate(prev => prev + 1), 0);
        } else if (target.tagName === 'SELECT' || target.tagName === 'TEXTAREA') {
          setTimeout(() => setForceUpdate(prev => prev + 1), 0);
        }
        // Skip checkbox interactions as they don't affect content height
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

    const estimatedHeight = this.getRowHeight(lineIndex);
    
    return (
      <div 
        key={`row-${lineIndex}-${forceUpdate}-${!!this.props.renderGutter}-${this.props.noise.length}`} 
        style={{
          ...style,
          height: 'auto', // Let content determine height
          minHeight: style.height, // Use virtual list height as minimum
          margin: 0,
          padding: 0,
          overflow: 'visible', // Allow content to be fully visible
        }} 
        ref={rowRef}
      >
        <table 
          className={cn(this.styles.diffContainer, {
            [this.styles.splitView]: this.props.splitView,
          })}
          style={{ 
            width: '100%', 
            tableLayout: 'fixed',
            wordBreak: 'break-word',
            borderCollapse: 'collapse',
            borderSpacing: 0,
            marginBottom: 0
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
            {this.props.splitView ? this.renderSplitViewRow(line, lineIndex) : this.renderInlineViewRow(line, lineIndex)}
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

  private renderDiff = (): JSX.Element => {
    const { leftTitle, rightTitle } = this.props;
    const hasTitle = leftTitle || rightTitle;

    const containerStyle = {
      width: '100%',
      height: 'calc(80vh - 90px)',
      minHeight: '300px',
      maxHeight: '1300px',
      overflow: 'auto' as const
    };
    
    return (
      <div style={containerStyle}>
        <AutoSizer>
          {({ height, width }: { height: number; width: number }) => {
            
            this.clearHeightsOnWidthChange(width);
            
            const ListComponent = VariableSizeList as any;
            // Add 1 to itemCount if we have a title (title will be the first item)
            const itemCount = hasTitle ? this.lineInformation.length + 1 : this.lineInformation.length;
            
            return (
              <ListComponent
                height={height}
                width={width}
                itemCount={itemCount}
                itemSize={(index: number) => {
                  // Title row gets fixed height of 40px
                  if (hasTitle && index === 0) return 40;
                  // Calculate height based on content for other rows
                  const lineIndex = hasTitle ? index - 1 : index;
                  return this.getRowHeight(lineIndex);
                }}
                ref={this.listRef}
                overscanCount={5} // Show a few extra items for smooth scrolling
                estimatedItemSize={28}
                layout="vertical"
                key={`${width}-${height}-${this.props.noise.length}-${!!this.props.renderGutter}`} // Force re-render on size, noise, or gutter change
              >
                {this.VirtualizedRowWithTitle}
              </ListComponent>
            );
          }}
        </AutoSizer>
      </div>
    );
  };



  public render = (): JSX.Element => {
    const {
      oldValue,
      newValue,
      useDarkTheme,
      disableWordDiff,
      compareMethod,
      linesOffset,
      noise,
    } = this.props;

    if (typeof oldValue !== 'string' || typeof newValue !== 'string') {
      throw Error('"oldValue" and "newValue" should be strings');
    }

    this.styles = this.computeStyles(this.props.styles, useDarkTheme);
    
    const { lineInformation } = computeLineInformation(
      oldValue,
      newValue,
      noise,
      disableWordDiff,
      compareMethod,
      linesOffset,
    );
    this.lineInformation = lineInformation;

    //virtualized rendering
    return (
      <div>
        {this.renderDiff()}
      </div>
    );
  };
}

export default DiffViewer;
export { ReactDiffViewerStylesOverride, DiffMethod };