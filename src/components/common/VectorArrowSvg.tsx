/**
 * VectorArrowSvg Component
 * ------------------------
 * Renders crisp SVG directional arrows (one-way, bidirectional, solid, or dashed)
 * over any 16:9 room container using percentage coordinates (0..100).
 */

import React from 'react';
import { VectorArrow } from '../../types/models';

interface VectorArrowSvgProps {
  arrows: VectorArrow[];
  draftPoints?: { xPercent: number; yPercent: number }[];
  draftColor?: string;
  draftDashed?: boolean;
  draftBidirectional?: boolean;
  draftHasArrowhead?: boolean;
  interactive?: boolean;
  selectedArrowId?: string | null;
  onSelectArrow?: (arrowId: string) => void;
  compact?: boolean;
}

export const VectorArrowSvg: React.FC<VectorArrowSvgProps> = ({
  arrows,
  draftPoints = [],
  draftColor = '#06b6d4',
  draftDashed = false,
  draftBidirectional = false,
  draftHasArrowhead = true,
  interactive = false,
  selectedArrowId = null,
  onSelectArrow,
  compact = false,
}) => {
  if (arrows.length === 0 && draftPoints.length === 0) {
    return null;
  }

  const strokeWidth = compact ? 1.4 : 0.9;

  return (
    <svg
      viewBox="0 0 100 100"
      preserveAspectRatio="none"
      className="absolute inset-0 w-full h-full pointer-events-none z-10 overflow-visible"
    >
      <defs>
        {arrows.map((arrow) => (
          <React.Fragment key={`defs-${arrow.id}`}>
            <marker
              id={`arrow-end-${arrow.id}`}
              viewBox="0 0 10 10"
              refX="7"
              refY="5"
              markerWidth={compact ? 4.5 : 5.5}
              markerHeight={compact ? 4.5 : 5.5}
              orient="auto-start-reverse"
            >
              <path d="M 0 1.5 L 9 5 L 0 8.5 z" fill={arrow.color} />
            </marker>
            {arrow.bidirectional && (
              <marker
                id={`arrow-start-${arrow.id}`}
                viewBox="0 0 10 10"
                refX="7"
                refY="5"
                markerWidth={compact ? 4.5 : 5.5}
                markerHeight={compact ? 4.5 : 5.5}
                orient="auto-start-reverse"
              >
                <path d="M 0 1.5 L 9 5 L 0 8.5 z" fill={arrow.color} />
              </marker>
            )}
          </React.Fragment>
        ))}

        {/* Draft arrow marker */}
        <marker
          id="arrow-draft-end"
          viewBox="0 0 10 10"
          refX="7"
          refY="5"
          markerWidth="5.5"
          markerHeight="5.5"
          orient="auto-start-reverse"
        >
          <path d="M 0 1.5 L 9 5 L 0 8.5 z" fill={draftColor} />
        </marker>
      </defs>

      {arrows.map((arrow) => {
        if (arrow.points.length < 2) return null;
        const pointsAttr = arrow.points
          .map((p) => `${p.xPercent},${p.yPercent}`)
          .join(' ');
        const isSelected = selectedArrowId === arrow.id;
        const midPoint = arrow.points[Math.floor(arrow.points.length / 2)];

        return (
          <g key={arrow.id}>
            {/* Dark contrast outline for visibility over bright screenshots */}
            <polyline
              points={pointsAttr}
              fill="none"
              stroke="rgba(2, 6, 23, 0.85)"
              strokeWidth={strokeWidth * 2.2}
              strokeLinecap="round"
              strokeLinejoin="round"
            />
            {/* Main colored vector path */}
            <polyline
              points={pointsAttr}
              fill="none"
              stroke={arrow.color}
              strokeWidth={isSelected ? strokeWidth * 1.5 : strokeWidth}
              strokeDasharray={arrow.dashed ? '2.5, 1.8' : undefined}
              strokeLinecap="round"
              strokeLinejoin="round"
              markerEnd={
                arrow.hasArrowhead !== false
                  ? `url(#arrow-end-${arrow.id})`
                  : undefined
              }
              markerStart={
                arrow.hasArrowhead !== false && arrow.bidirectional
                  ? `url(#arrow-start-${arrow.id})`
                  : undefined
              }
            />
            {/* Invisible wider hit target when interactive */}
            {interactive && (
              <polyline
                points={pointsAttr}
                fill="none"
                stroke="transparent"
                strokeWidth={4}
                className="pointer-events-auto cursor-pointer"
                onClick={(e) => {
                  e.stopPropagation();
                  onSelectArrow?.(arrow.id);
                }}
              />
            )}
            {/* Optional arrow text label */}
            {arrow.label && !compact && midPoint && (
              <text
                x={midPoint.xPercent}
                y={Math.max(4, midPoint.yPercent - 2.2)}
                textAnchor="middle"
                fill="#f8fafc"
                fontSize="2.8"
                fontWeight="bold"
                style={{
                  paintOrder: 'stroke',
                  stroke: '#020617',
                  strokeWidth: '0.9px',
                }}
              >
                {arrow.label}
              </text>
            )}
          </g>
        );
      })}

      {/* Draft arrow being drawn */}
      {draftPoints.length >= 2 && (
        <polyline
          points={draftPoints.map((p) => `${p.xPercent},${p.yPercent}`).join(' ')}
          fill="none"
          stroke={draftColor}
          strokeWidth={strokeWidth}
          strokeDasharray={draftDashed ? '2.5, 1.8' : undefined}
          markerEnd={draftHasArrowhead ? 'url(#arrow-draft-end)' : undefined}
          markerStart={
            draftHasArrowhead && draftBidirectional
              ? 'url(#arrow-draft-end)'
              : undefined
          }
        />
      )}
    </svg>
  );
};
