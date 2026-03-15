"use client";

import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { AnimatePresence, motion } from "framer-motion";
import {
  DndContext,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  closestCenter,
} from "@dnd-kit/core";
import { restrictToParentElement } from "@dnd-kit/modifiers";
import {
  SortableContext,
  rectSortingStrategy,
  useSortable,
  arrayMove,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import {
  Drawer,
  DrawerContent,
  DrawerHeader,
  DrawerTitle,
  DrawerClose,
} from "@/components/ui/drawer";
import { CloseIcon, MinusIcon, ResetIcon, SettingsIcon } from "./Icons";
import ConfirmModal from "./ConfirmModal";
import { cn } from "@/lib/utils";

function SortableIndexItem({ item, canRemove, onRemove, isMobile }) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: item.code });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    cursor: isDragging ? "grabbing" : "grab",
    flex: isMobile
      ? "0 0 calc((100% - 24px) / 3)"
      : "0 0 calc((100% - 48px) / 5)",
    touchAction: "none",
    ...(isDragging && {
      position: "relative",
      zIndex: 10,
      opacity: 0.9,
      boxShadow: "0 8px 24px rgba(0,0,0,0.15)",
    }),
  };

  const isUp = item.change >= 0;
  const color = isUp ? "var(--danger)" : "var(--success)";

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={cn(
        "glass card",
        "relative flex flex-col gap-1.5 rounded-xl border border-[var(--border)] bg-[var(--card)] px-3 py-2"
      )}
      {...attributes}
      {...listeners}
    >
      {canRemove && (
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onRemove(item.code);
          }}
          className="icon-button"
          style={{
            position: "absolute",
            top: 4,
            right: 4,
            width: 18,
            height: 18,
            borderRadius: "999px",
            backgroundColor: "rgba(255,96,96,0.1)",
            color: "var(--danger)",
            border: "none",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
          }}
          aria-label={`移除 ${item.name}`}
        >
          <MinusIcon width="10" height="10" />
        </button>
      )}
      <div
        style={{
          fontSize: 13,
          fontWeight: 500,
          paddingRight: 18,
          whiteSpace: "nowrap",
          overflow: "hidden",
          textOverflow: "ellipsis",
        }}
      >
        {item.name}
      </div>
      <div style={{ fontSize: 18, fontWeight: 600, color }}>
        {item.price?.toFixed ? item.price.toFixed(2) : String(item.price ?? "-")}
      </div>
      <div style={{ fontSize: 12, color }}>
        {(item.change >= 0 ? "+" : "") + item.change.toFixed(2)}{" "}
        {(item.changePercent >= 0 ? "+" : "") + item.changePercent.toFixed(2)}%
      </div>
    </div>
  );
}

/**
 * 指数个性化设置弹框
 *
 * - 移动端：使用 Drawer（自底向上抽屉）
 * - PC 端：使用 Dialog（居中弹窗）
 *
 * @param {Object} props
 * @param {boolean} props.open - 是否打开
 * @param {() => void} props.onClose - 关闭回调
 * @param {boolean} props.isMobile - 是否为移动端（由上层传入）
 * @param {Array<{code:string,name:string,price:number,change:number,changePercent:number}>} props.indices - 当前可用的大盘指数列表
 * @param {string[]} props.selectedCodes - 已选中的指数 code，决定展示顺序
 * @param {(codes: string[]) => void} props.onChangeSelected - 更新选中指数集合
 * @param {() => void} props.onResetDefault - 恢复默认选中集合
 */
export default function MarketSettingModal({
  open,
  onClose,
  isMobile,
  indices = [],
  selectedCodes = [],
  onChangeSelected,
  onResetDefault,
}) {
  const selectedList = useMemo(() => {
    if (!indices?.length || !selectedCodes?.length) return [];
    const map = new Map(indices.map((it) => [it.code, it]));
    return selectedCodes
      .map((code) => map.get(code))
      .filter(Boolean);
  }, [indices, selectedCodes]);

  const allIndices = indices || [];
  const selectedSet = useMemo(
    () => new Set(selectedCodes || []),
    [selectedCodes]
  );

  const [resetConfirmOpen, setResetConfirmOpen] = useState(false);

  useEffect(() => {
    if (!open) setResetConfirmOpen(false);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [open]);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor)
  );

  const handleToggleCode = (code) => {
    if (!code) return;
    if (selectedSet.has(code)) {
      // 至少保留一个指数，阻止把最后一个也移除
      if (selectedCodes.length <= 1) return;
      const next = selectedCodes.filter((c) => c !== code);
      onChangeSelected?.(next);
    } else {
      const next = [...selectedCodes, code];
      onChangeSelected?.(next);
    }
  };

  const handleDragEnd = (event) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const oldIndex = selectedCodes.indexOf(active.id);
    const newIndex = selectedCodes.indexOf(over.id);
    if (oldIndex === -1 || newIndex === -1) return;
    const next = arrayMove(selectedCodes, oldIndex, newIndex);
    onChangeSelected?.(next);
  };

  const body = (
    <div className="flex flex-col gap-4 px-4 pb-4 pt-2 text-[var(--text)]">
      <div>
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: 8,
            marginBottom: 8,
          }}
        >
          <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
            <div style={{ fontSize: 14, fontWeight: 600 }}>已添加指数</div>
            <div
              className="muted"
              style={{ fontSize: 12, color: "var(--muted-foreground)" }}
            >
              拖动下方指数即可排序
            </div>
          </div>
        </div>

        {selectedList.length === 0 ? (
          <div
            className="muted"
            style={{
              fontSize: 13,
              color: "var(--muted-foreground)",
              padding: "12px 0 4px",
            }}
          >
            暂未添加指数，请在下方选择想要关注的指数。
          </div>
        ) : (
          <DndContext
            sensors={sensors}
            collisionDetection={closestCenter}
            onDragEnd={handleDragEnd}
            modifiers={[restrictToParentElement]}
          >
            <SortableContext
              items={selectedCodes}
              strategy={rectSortingStrategy}
            >
              <div className="flex flex-wrap gap-3">
                {selectedList.map((item) => (
                  <SortableIndexItem
                    key={item.code}
                    item={item}
                    canRemove={selectedCodes.length > 1}
                    onRemove={handleToggleCode}
                    isMobile={isMobile}
                  />
                ))}
              </div>
            </SortableContext>
          </DndContext>
        )}
      </div>

      <div>
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: 8,
            marginBottom: 10,
          }}
        >
          <div
            className="muted"
            style={{
              fontSize: 13,
              color: "var(--muted-foreground)",
            }}
          >
            点击即可选指数
          </div>
          {onResetDefault && (
            <button
              type="button"
              className="icon-button"
              onClick={() => setResetConfirmOpen(true)}
              style={{
                border: "none",
                width: 28,
                height: 28,
                backgroundColor: "transparent",
                color: "var(--muted-foreground)",
                display: "inline-flex",
                alignItems: "center",
                justifyContent: "center",
              }}
              aria-label="恢复默认指数"
            >
              <ResetIcon width="16" height="16" />
            </button>
          )}
        </div>

        <div
          className="chips"
          style={{
            display: "flex",
            flexWrap: "wrap",
            gap: 8,
          }}
        >
          {allIndices.map((item) => {
            const active = selectedSet.has(item.code);
            return (
              <button
                key={item.code || item.name}
                type="button"
                onClick={() => handleToggleCode(item.code)}
                className={cn("chip", active && "active")}
                style={{
                  height: 30,
                  fontSize: 12,
                  padding: "0 12px",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  borderRadius: 16,
                }}
              >
                {item.name}
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );

  if (!open) return null;

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
          defaultHeight="77vh"
          minHeight="40vh"
          maxHeight="90vh"
        >
          <DrawerHeader className="flex flex-row items-center justify-between gap-2 py-4">
            <DrawerTitle className="flex items-center gap-2.5 text-left">
              <SettingsIcon width="20" height="20" />
              <span>指数个性化设置</span>
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
        <AnimatePresence>
          {resetConfirmOpen && (
            <ConfirmModal
              key="mobile-index-reset-confirm"
              title="恢复默认指数"
              message="是否恢复已添加指数为默认配置？"
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
                onResetDefault?.();
                setResetConfirmOpen(false);
              }}
              onCancel={() => setResetConfirmOpen(false)}
            />
          )}
        </AnimatePresence>
      </Drawer>
    );
  }

  const pcContent = (
    <AnimatePresence>
      {open && (
        <motion.div
          key="market-index-setting-overlay"
          className="pc-table-setting-overlay"
          role="dialog"
          aria-modal="true"
          aria-label="指数个性化设置"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.2 }}
          onClick={onClose}
          style={{ zIndex: 10001 }}
        >
          <motion.aside
            className="pc-market-setting-drawer pc-table-setting-drawer glass"
            initial={{ x: "100%" }}
            animate={{ x: 0 }}
            exit={{ x: "100%" }}
            transition={{ type: "spring", damping: 30, stiffness: 300 }}
            onClick={(e) => e.stopPropagation()}
            style={{ width: 690 }}
          >
            <div className="pc-table-setting-header">
              <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                <SettingsIcon width="20" height="20" />
                <span>指数个性化设置</span>
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
            <div className="pc-table-setting-body">{body}</div>
          </motion.aside>
        </motion.div>
      )}
      {resetConfirmOpen && (
        <ConfirmModal
          key="pc-index-reset-confirm"
          title="恢复默认指数"
          message="是否恢复已添加指数为默认配置？"
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
            onResetDefault?.();
            setResetConfirmOpen(false);
          }}
          onCancel={() => setResetConfirmOpen(false)}
        />
      )}
    </AnimatePresence>
  );

  if (typeof document === "undefined") return null;
  return createPortal(pcContent, document.body);
}

