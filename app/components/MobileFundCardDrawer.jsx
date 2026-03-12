'use client';

import {
  Drawer,
  DrawerClose,
  DrawerContent,
  DrawerHeader,
  DrawerTitle, DrawerTrigger,
} from '@/components/ui/drawer';
import FundCard from './FundCard';
import { CloseIcon } from './Icons';

/**
 * 移动端基金详情底部 Drawer 弹框
 *
 * @param {Object} props
 * @param {boolean} props.open - 是否打开
 * @param {(open: boolean) => void} props.onOpenChange - 打开状态变化回调
 * @param {boolean} [props.blockDrawerClose] - 是否禁止关闭（如上层有弹框时）
 * @param {React.MutableRefObject<boolean>} [props.ignoreNextDrawerCloseRef] - 忽略下一次关闭（用于点击到内部 dialog 时）
 * @param {Object|null} props.cardSheetRow - 当前选中的行数据，用于 getFundCardProps
 * @param {(row: any) => Object} [props.getFundCardProps] - 根据行数据返回 FundCard 的 props
 */
export default function MobileFundCardDrawer({
  open,
  onOpenChange,
  blockDrawerClose = false,
  ignoreNextDrawerCloseRef,
  cardSheetRow,
  getFundCardProps,
  children,
}) {
  return (
    <Drawer
      open={open}
      onOpenChange={(nextOpen) => {
        if (!nextOpen) {
          if (ignoreNextDrawerCloseRef?.current) {
            ignoreNextDrawerCloseRef.current = false;
            return;
          }
          if (!blockDrawerClose) onOpenChange(false);
        }
      }}
    >
      <DrawerTrigger asChild>
        {children}
      </DrawerTrigger>
      <DrawerContent
        className="h-[77vh] max-h-[88vh] mt-0 flex flex-col"
        onPointerDownOutside={(e) => {
          if (blockDrawerClose) return;
          if (e?.target?.closest?.('[data-slot="dialog-content"], [role="dialog"]')) {
            if (ignoreNextDrawerCloseRef) ignoreNextDrawerCloseRef.current = true;
            return;
          }
          onOpenChange(false);
        }}
      >
        <DrawerHeader className="flex-shrink-0 flex flex-row items-center justify-between gap-2 space-y-0 px-5 pb-4 pt-2 text-left">
          <DrawerTitle className="text-base font-semibold text-[var(--text)]">
            基金详情
          </DrawerTitle>
          <DrawerClose
            className="icon-button border-none bg-transparent p-1"
            title="关闭"
            style={{ borderColor: 'transparent', backgroundColor: 'transparent' }}
          >
            <CloseIcon width="20" height="20" />
          </DrawerClose>
        </DrawerHeader>
        <div
          className="flex-1 min-h-0 overflow-y-auto px-5 pb-8 pt-0"
          style={{ paddingBottom: 'calc(24px + env(safe-area-inset-bottom, 0px))' }}
        >
          {cardSheetRow && getFundCardProps ? (
            <FundCard {...getFundCardProps(cardSheetRow)} />
          ) : null}
        </div>
      </DrawerContent>
    </Drawer>
  );
}
