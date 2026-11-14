import {defaultPrecision, motionLabels, backgroundEffectLabels, stickerChoices, motionChoices, backgroundEffectChoices} from './precision';
import type {Project} from './model';
import type {PrecisionSettings, BackgroundEffect} from './precision';
import {ChevronDown, RotateCcw} from 'lucide-react';
import {useState} from 'react';
import './precision-controls.css';

interface PrecisionControlsProps {
  project: Project;
  change: (fn: (p: Project) => Project) => void;
}

export function PrecisionControls({project, change}: PrecisionControlsProps) {
  const precision = project.precision ?? defaultPrecision();
  const [openSection, setOpenSection] = useState<string | null>('background');

  const updatePrecision = (fn: (p: PrecisionSettings) => PrecisionSettings) =>
    change(p => ({...p, precision: fn(p.precision ?? defaultPrecision())}));

  const toggleSection = (id: string) => {
    setOpenSection(openSection === id ? null : id);
  };

  return (
    <details className="precision-controls" open={openSection !== null}>
      <summary>
        <span>🎨 세부 조정</span>
        <ChevronDown size={16} />
      </summary>
      <div className="precision-body">
        {/* 배경 설정 */}
        <div className="precision-section">
          <button className="section-header active" onClick={() => toggleSection('background')}>
            <span>배경 효과</span>
            <ChevronDown size={14} />
          </button>
          <div className="section-content">
            <div className="precision-select">
              <label>효과</label>
              <select value={precision.background.effect} onChange={e => updatePrecision(p => ({
                ...p,
                background: {...p.background, effect: e.target.value as BackgroundEffect}
              }))}>
                {backgroundEffectChoices.map(effect => (
                  <option key={effect} value={effect}>
                    {backgroundEffectLabels[effect]}
                  </option>
                ))}
              </select>
            </div>

            {precision.background.effect !== 'none' && (
              <div className="precision-slider">
                <span>
                  <label>강도</label>
                  <output>{Math.round(precision.background.effectIntensity * 100)}%</output>
                </span>
                <input type="range" min="0" max="1" step="0.05"
                  value={precision.background.effectIntensity}
                  onChange={e => updatePrecision(p => ({
                    ...p,
                    background: {...p.background, effectIntensity: parseFloat(e.target.value)}
                  }))}
                />
              </div>
            )}

            <div className="precision-slider">
              <span>
                <label>투명도</label>
                <output>{Math.round(precision.background.opacity * 100)}%</output>
              </span>
              <input type="range" min="0" max="1" step="0.05"
                value={precision.background.opacity}
                onChange={e => updatePrecision(p => ({
                  ...p,
                  background: {...p.background, opacity: parseFloat(e.target.value)}
                }))}
              />
            </div>

            <div className="precision-slider">
              <span>
                <label>확대</label>
                <output>{(precision.background.zoom * 100).toFixed(0)}%</output>
              </span>
              <input type="range" min="1" max="2" step="0.1"
                value={precision.background.zoom}
                onChange={e => updatePrecision(p => ({
                  ...p,
                  background: {...p.background, zoom: parseFloat(e.target.value)}
                }))}
              />
            </div>
          </div>
        </div>

        {/* 스티커 설정 */}
        <div className="precision-section">
          <button className="section-header" onClick={() => toggleSection('sticker')}>
            <span>스티커 & 이모지</span>
            <ChevronDown size={14} />
          </button>
          {openSection === 'sticker' && (
            <div className="section-content">
              <div className="precision-subsection">
                <h4>이모지 선택</h4>
                <div className="expression-grid">
                  {stickerChoices.map(sticker => (
                    <button key={sticker || 'empty'} className={`expression-btn ${precision.sticker.glyph === sticker ? 'active' : ''}`}
                      onClick={() => updatePrecision(p => ({
                        ...p,
                        sticker: {...p.sticker, glyph: sticker}
                      }))}>
                      <span className="emoji-btn">{sticker || '없음'}</span>
                    </button>
                  ))}
                </div>
              </div>

              {precision.sticker.glyph && (
                <>
                  <div className="precision-slider">
                    <span>
                      <label>크기</label>
                      <output>{Math.round(precision.sticker.size)}px</output>
                    </span>
                    <input type="range" min="40" max="160" step="5"
                      value={precision.sticker.size}
                      onChange={e => updatePrecision(p => ({
                        ...p,
                        sticker: {...p.sticker, size: parseInt(e.target.value)}
                      }))}
                    />
                  </div>

                  <div className="precision-slider">
                    <span>
                      <label>회전</label>
                      <output>{Math.round(precision.sticker.rotation)}°</output>
                    </span>
                    <input type="range" min="0" max="360" step="15"
                      value={precision.sticker.rotation}
                      onChange={e => updatePrecision(p => ({
                        ...p,
                        sticker: {...p.sticker, rotation: parseInt(e.target.value)}
                      }))}
                    />
                  </div>

                  <div className="precision-slider">
                    <span>
                      <label>가로 위치</label>
                      <output>{(precision.sticker.x * 100).toFixed(0)}%</output>
                    </span>
                    <input type="range" min="0.1" max="0.9" step="0.05"
                      value={precision.sticker.x}
                      onChange={e => updatePrecision(p => ({
                        ...p,
                        sticker: {...p.sticker, x: parseFloat(e.target.value)}
                      }))}
                    />
                  </div>

                  <div className="precision-slider">
                    <span>
                      <label>세로 위치</label>
                      <output>{(precision.sticker.y * 100).toFixed(0)}%</output>
                    </span>
                    <input type="range" min="0.1" max="0.9" step="0.05"
                      value={precision.sticker.y}
                      onChange={e => updatePrecision(p => ({
                        ...p,
                        sticker: {...p.sticker, y: parseFloat(e.target.value)}
                      }))}
                    />
                  </div>
                </>
              )}
            </div>
          )}
        </div>

        {/* 텍스트 설정 */}
        <div className="precision-section">
          <button className="section-header" onClick={() => toggleSection('text')}>
            <span>텍스트 위치 & 색상</span>
            <ChevronDown size={14} />
          </button>
          {openSection === 'text' && (
            <div className="section-content">
              {['brand', 'title', 'description', 'company', 'contact'].map(layer => {
                const style = precision.text[layer as keyof typeof precision.text];
                if (!style) return null;
                const labels: Record<string, string> = {
                  brand: '상단 기업명',
                  title: '제목',
                  description: '설명',
                  company: '기업명',
                  contact: '연락처'
                };
                return (
                  <div key={layer} className="precision-subsection">
                    <h4>{labels[layer]}</h4>

                    <div className="precision-color">
                      <label>색상</label>
                      <div className="color-input-wrap">
                        <input type="color"
                          value={style.color}
                          onChange={e => updatePrecision(p => ({
                            ...p,
                            text: {...p.text, [layer]: {...style, color: e.target.value}}
                          }))}
                        />
                        <input type="text" placeholder="#000000" maxLength={7}
                          value={style.color}
                          onChange={e => updatePrecision(p => ({
                            ...p,
                            text: {...p.text, [layer]: {...style, color: e.target.value}}
                          }))}
                        />
                      </div>
                    </div>

                    <div className="precision-slider">
                      <span>
                        <label>투명도</label>
                        <output>{Math.round(style.opacity * 100)}%</output>
                      </span>
                      <input type="range" min="0" max="1" step="0.1"
                        value={style.opacity}
                        onChange={e => updatePrecision(p => ({
                          ...p,
                          text: {...p.text, [layer]: {...style, opacity: parseFloat(e.target.value)}}
                        }))}
                      />
                    </div>

                    <div className="precision-slider">
                      <span>
                        <label>크기</label>
                        <output>{(style.scale * 100).toFixed(0)}%</output>
                      </span>
                      <input type="range" min="0.7" max="1.3" step="0.1"
                        value={style.scale}
                        onChange={e => updatePrecision(p => ({
                          ...p,
                          text: {...p.text, [layer]: {...style, scale: parseFloat(e.target.value)}}
                        }))}
                      />
                    </div>

                    <div className="precision-slider">
                      <span>
                        <label>가로 위치</label>
                        <output>{(style.x * 100).toFixed(1)}%</output>
                      </span>
                      <input type="range" min="-0.1" max="0.1" step="0.01"
                        value={style.x}
                        onChange={e => updatePrecision(p => ({
                          ...p,
                          text: {...p.text, [layer]: {...style, x: parseFloat(e.target.value)}}
                        }))}
                      />
                    </div>

                    <div className="precision-slider">
                      <span>
                        <label>세로 위치</label>
                        <output>{(style.y * 100).toFixed(1)}%</output>
                      </span>
                      <input type="range" min="-0.1" max="0.1" step="0.01"
                        value={style.y}
                        onChange={e => updatePrecision(p => ({
                          ...p,
                          text: {...p.text, [layer]: {...style, y: parseFloat(e.target.value)}}
                        }))}
                      />
                    </div>

                    <div className="precision-select">
                      <label>폰트</label>
                      <select value={style.font} onChange={e => updatePrecision(p => ({
                        ...p,
                        text: {...p.text, [layer]: {...style, font: e.target.value as 'sans' | 'serif' | 'mono'}}
                      }))}>
                        <option value="sans">기본</option>
                        <option value="serif">세리프</option>
                        <option value="mono">고정폭</option>
                      </select>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* 동작 효과 */}
        <div className="precision-section">
          <button className="section-header" onClick={() => toggleSection('motion')}>
            <span>동작 효과</span>
            <ChevronDown size={14} />
          </button>
          {openSection === 'motion' && (
            <div className="section-content">
              <div className="motion-grid">
                {motionChoices.map(motion => (
                  <button key={motion} className={`motion-btn ${precision.motion === motion ? 'active' : ''}`}
                    onClick={() => updatePrecision(p => ({...p, motion}))}>
                    <span className="motion-icon">
                      {motion === 'none' ? '—' :
                       motion === 'rays' ? '☀️' :
                       motion === 'swoosh' ? '〰️' :
                       motion === 'spiral' ? '◯' :
                       motion === 'pulse' ? '◉◉' :
                       motion === 'glow' ? '✨' :
                       motion === 'shimmer' ? '≈≈' :
                       motion === 'float' ? '⠿' : ''}
                    </span>
                    <small>{motionLabels[motion]}</small>
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* 초기화 버튼 */}
        <div className="precision-footer">
          <button className="precision-reset-all" onClick={() => updatePrecision(() => defaultPrecision())}>
            <RotateCcw size={12} />
            모두 초기화
          </button>
        </div>
      </div>
    </details>
  );
}
