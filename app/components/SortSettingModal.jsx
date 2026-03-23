"use client";

import { useEffect, useState } from "react";
import { AnimatePresence, motion, Reorder } from "framer-motion";
import { createPortal } from "react-dom";
import {
  Drawer,
  DrawerContent,
  DrawerHeader,
  DrawerTitle,
  DrawerClose,
} from "@/components/ui/drawer";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { CloseIcon, DragIcon, ResetIcon, SettingsIcon } from "./Icons";
import ConfirmModal from "./ConfirmModal";

/**
 * 排序个性化设置弹框
 *
 * - 移动端：使用 Drawer（自底向上抽屉，参考市场指数设置）
 * - PC 端：使用右侧侧弹框（样式参考 PcTableSettingModal）
 *
 * @param {Object} props
 * @param {boolean} props.open - 是否打开
 * @param {() => void} props.onClose - 关闭回调
 * @param {boolean} props.isMobile - 是否为移动端（由上层传入）
 * @param {Array<{id: string, label: string, enabled: boolean}>} props.rules - 排序规则列表
 * @param {(nextRules: Array<{id: string, label: string, enabled: boolean}>) => void} props.onChangeRules - 规则变更回调
 */
export default function SortSettingModal({
  open,
  onClose,
  isMobile,
  rules = [],
  onChangeRules,
  onResetRules,
  sortDisplayMode = "buttons",
  onChangeSortDisplayMode,
}) {
  const [localRules, setLocalRules] = useState(rules);
  const [editingId, setEditingId] = useState(null);
  const [editingAlias, setEditingAlias] = useState("");
  const [resetConfirmOpen, setResetConfirmOpen] = useState(false);

  useEffect(() => {
    if (open) {
      const defaultRule = (rules || []).find((item) => item.id === "default");
      const otherRules = (rules || []).filter((item) => item.id !== "default");
      const ordered = defaultRule ? [defaultRule, ...otherRules] : otherRules;
      setLocalRules(ordered);
      const prev = document.body.style.overflow;
      document.body.style.overflow = "hidden";
      return () => {
        document.body.style.overflow = prev;
      };
    }
  }, [open, rules]);

  const handleReorder = (nextItems) => {
    // 基于当前 localRules 计算新顺序（默认规则固定在首位）
    const defaultRule = (localRules || []).find((item) => item.id === "default");
    const combined = defaultRule ? [defaultRule, ...nextItems] : nextItems;
    setLocalRules(combined);
    if (onChangeRules) {
      queueMicrotask(() => {
        onChangeRules(combined);
      });
    }
  };

  const handleToggle = (id) => {
    const next = (localRules || []).map((item) =>
      item.id === id ? { ...item, enabled: !item.enabled } : item
    );
    setLocalRules(next);
    if (onChangeRules) {
      queueMicrotask(() => {
        onChangeRules(next);
      });
    }
  };

  const startEditAlias = (item) => {
    if (!item || item.id === "default") return;
    setEditingId(item.id);
    setEditingAlias(item.alias || "");
  };

  const commitAlias = () => {
    if (!editingId) return;
    let nextRules = null;
    setLocalRules((prev) => {
      const next = prev.map((item) =>
        item.id === editingId
          ? { ...item, alias: editingAlias.trim() || undefined }
          : item
      );
      nextRules = next;
      return next;
    });
    if (nextRules) {
      // 将父组件状态更新放到微任务中，避免在 SortSettingModal 渲染过程中直接更新 HomePage
      queueMicrotask(() => {
        onChangeRules?.(nextRules);
      });
    }
    setEditingId(null);
    setEditingAlias("");
  };

  const cancelAlias = () => {
    setEditingId(null);
    setEditingAlias("");
  };

  if (!open) return null;

  const body = (
    <div
      className={
        isMobile
          ? "mobile-setting-body flex flex-1 flex-col overflow-y-auto"
          : "pc-table-setting-body"
      }
    >
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 12,
          marginBottom: 16,
        }}
      >
        <h3
          className="pc-table-setting-subtitle"
          style={{ margin: 0, fontSize: 14 }}
        >
          排序形式
        </h3>
        <div style={{ display: "flex", justifyContent: "flex-end", marginLeft: "auto" }}>
          <RadioGroup
            value={sortDisplayMode}
            onValueChange={(value) => onChangeSortDisplayMode?.(value)}
            className="flex flex-row items-center gap-4"
          >
            <label
              htmlFor="sort-display-mode-buttons"
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 6,
                fontSize: 13,
                color: "var(--text)",
                cursor: "pointer",
              }}
            >
              <RadioGroupItem id="sort-display-mode-buttons" value="buttons" />
              <span>按钮</span>
            </label>
            <label
              htmlFor="sort-display-mode-dropdown"
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 6,
                fontSize: 13,
                color: "var(--text)",
                cursor: "pointer",
              }}
            >
              <RadioGroupItem id="sort-display-mode-dropdown" value="dropdown" />
              <span>下拉单选</span>
            </label>
          </RadioGroup>
        </div>
      </div>

      <div
        style={{
          display: "flex",
          flexDirection: "column",
          gap: 4,
          marginBottom: 16,
        }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: 8,
          }}
        >
          <h3
            className="pc-table-setting-subtitle"
            style={{ margin: 0, fontSize: 14 }}
          >
            排序规则
          </h3>
          {onResetRules && (
            <button
              type="button"
              className="icon-button"
              onClick={() => setResetConfirmOpen(true)}
              title="重置排序规则"
              style={{
                border: "none",
                width: 28,
                height: 28,
                backgroundColor: "transparent",
                color: "var(--muted-foreground)",
                flexShrink: 0,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              <ResetIcon width="16" height="16" />
            </button>
          )}
        </div>
        <p
          className="muted"
          style={{ fontSize: 12, margin: 0, color: "var(--muted-foreground)" }}
        >
          可拖拽调整优先级，右侧开关控制是否启用该排序规则。点击规则名称可编辑别名（例如“估值涨幅”的别名为“涨跌幅”）。
        </p>
      </div>

      {localRules.length === 0 ? (
        <div
          className="muted"
          style={{
            textAlign: "center",
            padding: "24px 0",
            fontSize: 14,
          }}
        >
          暂无可配置的排序规则。
        </div>
      ) : (
        <>
          {/* 默认排序固定在顶部，且不可排序、不可关闭 */}
          {localRules.find((item) => item.id === "default") && (
            <div
              className={
                (isMobile ? "mobile-setting-item" : "pc-table-setting-item") +
                " glass"
              }
              style={{
                display: "flex",
                alignItems: "center",
                marginBottom: 8,
              }}
            >
              <div
                style={{
                  width: 18,
                  height: 18,
                  marginLeft: 4,
                }}
              />
              <div
                style={{
                  flex: 1,
                  display: "flex",
                  flexDirection: "column",
                  gap: 2,
                }}
              >
                <span style={{ fontSize: 14 }}>
                  {localRules.find((item) => item.id === "default")?.label ||
                    "默认"}
                </span>
              </div>
            </div>
          )}

          {/* 其他规则支持拖拽和开关 */}
        <Reorder.Group
          axis="y"
          values={localRules.filter((item) => item.id !== "default")}
          onReorder={handleReorder}
          className={isMobile ? "mobile-setting-list" : "pc-table-setting-list"}
          layoutScroll={isMobile}
          style={isMobile ? { touchAction: "none" } : undefined}
        >
          <AnimatePresence mode="popLayout">
            {localRules
              .filter((item) => item.id !== "default")
              .map((item) => (
              <Reorder.Item
                key={item.id}
                value={item}
                className={
                  (isMobile ? "mobile-setting-item" : "pc-table-setting-item") +
                  " glass"
                }
                layout
                initial={{ opacity: 0, scale: 0.98 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.98 }}
                transition={{
                  type: "spring",
                  stiffness: 500,
                  damping: 35,
                  mass: 1,
                  layout: { duration: 0.2 },
                }}
                style={isMobile ? { touchAction: "none" } : undefined}
              >
                <div
                  className="drag-handle"
                  style={{
                    cursor: "grab",
                    display: "flex",
                    alignItems: "center",
                    padding: "0 8px",
                    color: "var(--muted)",
                  }}
                >
                  <DragIcon width="18" height="18" />
                </div>
                <div
                  style={{
                    flex: 1,
                    display: "flex",
                    flexDirection: "column",
                    gap: 2,
                  }}
                >
                  {editingId === item.id ? (
                    <div style={{ display: "flex", gap: 6 }}>
                      <input
                        autoFocus
                        value={editingAlias}
                        onChange={(e) => setEditingAlias(e.target.value)}
                        onBlur={commitAlias}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") {
                            e.preventDefault();
                            commitAlias();
                          } else if (e.key === "Escape") {
                            e.preventDefault();
                            cancelAlias();
                          }
                        }}
                        placeholder="输入别名，如涨跌幅"
                        style={{
                          flex: 1,
                          // 使用 >=16px 的字号，避免移动端聚焦时页面放大
                          fontSize: 16,
                          padding: "4px 8px",
                          borderRadius: 6,
                          border: "1px solid var(--border)",
                          background: "transparent",
                          color: "var(--text)",
                          outline: "none",
                        }}
                      />
                    </div>
                  ) : (
                    <>
                      <button
                        type="button"
                        onClick={() => startEditAlias(item)}
                        style={{
                          padding: 0,
                          margin: 0,
                          border: "none",
                          background: "transparent",
                          textAlign: "left",
                          fontSize: 14,
                          color: "inherit",
                          cursor: "pointer",
                        }}
                        title="点击修改别名"
                      >
                        {item.label}
                      </button>
                      {item.alias && (
                        <span
                          className="muted"
                          style={{
                            fontSize: 12,
                            color: "var(--muted-foreground)",
                          }}
                        >
                          {item.alias}
                        </span>
                      )}
                    </>
                  )}
                </div>
                {item.id !== "default" && (
                  <button
                    type="button"
                    className={
                      isMobile ? "icon-button" : "icon-button pc-table-column-switch"
                    }
                    onClick={(e) => {
                      e.stopPropagation();
                      handleToggle(item.id);
                    }}
                    title={item.enabled ? "关闭" : "开启"}
                    style={
                      isMobile
                        ? {
                            border: "none",
                            backgroundColor: "transparent",
                            cursor: "pointer",
                            flexShrink: 0,
                            display: "flex",
                            alignItems: "center",
                          }
                        : {
                            border: "none",
                            padding: "0 4px",
                            backgroundColor: "transparent",
                            cursor: "pointer",
                            flexShrink: 0,
                            display: "flex",
                            alignItems: "center",
                          }
                    }
                  >
                    <span
                      className={`dca-toggle-track ${
                        item.enabled ? "enabled" : ""
                      }`}
                    >
                      <span
                        className="dca-toggle-thumb"
                        style={{ left: item.enabled ? 16 : 2 }}
                      />
                    </span>
                  </button>
                )}
              </Reorder.Item>
            ))}
          </AnimatePresence>
        </Reorder.Group>
        </>
      )}
    </div>
  );

  const resetConfirm = (
    <AnimatePresence>
      {resetConfirmOpen && (
        <ConfirmModal
          key="reset-sort-rules-confirm"
          title="重置排序规则"
          message="是否将排序规则恢复为默认配置？这会重置顺序、开关状态以及别名设置。"
          icon={
            <ResetIcon
              width="20"
              height="20"
              className="shrink-0 text-[var(--primary)]"
            />
          }
          confirmVariant="primary"
          confirmText="恢复默认"
          onConfirm={() => {
            setResetConfirmOpen(false);
            queueMicrotask(() => {
              onResetRules?.();
            });
          }}
          onCancel={() => setResetConfirmOpen(false)}
        />
      )}
    </AnimatePresence>
  );

  if (isMobile) {
    return (
      <Drawer
        open={open}
        onOpenChange={(v) => {
          if (!v) onClose?.();
        }}
        direction="bottom"
      >
        <DrawerContent
          className="glass"
          defaultHeight="70vh"
          minHeight="40vh"
          maxHeight="90vh"
        >
          <DrawerHeader className="flex flex-row items-center justify-between gap-2 py-4">
            <DrawerTitle className="flex items-center gap-2.5 text-left">
              <SettingsIcon width="20" height="20" />
              <span>排序个性化设置</span>
            </DrawerTitle>
            <DrawerClose
              className="icon-button border-none bg-transparent p-1"
              title="关闭"
              style={{
                borderColor: "transparent",
                backgroundColor: "transparent",
              }}
            >
              <CloseIcon width="20" height="20" />
            </DrawerClose>
          </DrawerHeader>
          <div className="flex-1 overflow-y-auto">{body}</div>
        </DrawerContent>
        {resetConfirm}
      </Drawer>
    );
  }

  if (typeof document === "undefined") return null;

  const content = (
    <AnimatePresence>
      {open && (
        <motion.div
          key="sort-setting-overlay"
          className="pc-table-setting-overlay"
          role="dialog"
          aria-modal="true"
          aria-label="排序个性化设置"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.2 }}
          onClick={onClose}
          style={{ zIndex: 10001, alignItems: "stretch" }}
        >
          <motion.aside
            className="pc-table-setting-drawer glass"
            initial={{ x: "100%" }}
            animate={{ x: 0 }}
            exit={{ x: "100%" }}
            transition={{ type: "spring", damping: 30, stiffness: 300 }}
            onClick={(e) => e.stopPropagation()}
            style={{
              width: 420,
              maxWidth: 480,
            }}
          >
            <div className="pc-table-setting-header">
              <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                <SettingsIcon width="20" height="20" />
                <span>排序个性化设置</span>
              </div>
              <button
                type="button"
                className="icon-button"
                onClick={onClose}
                title="关闭"
                style={{ border: "none", background: "transparent" }}
              >
                <CloseIcon width="20" height="20" />
              </button>
            </div>

            {body}
          </motion.aside>
        </motion.div>
      )}
    </AnimatePresence>
  );

  return createPortal(
    <>
      {content}
      {resetConfirm}
    </>,
    document.body
  );
}
