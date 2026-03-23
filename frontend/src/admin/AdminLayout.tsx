import type { LayoutProps } from "react-admin";
import { Layout, Menu } from "react-admin";

/** User insights + referral settings are registered as `<Resource>` in main.tsx (appear in menu). */
export const AdminAppMenu = () => (
  <Menu>
    <Menu.ResourceItems />
  </Menu>
);

export const AdminAppLayout = (props: LayoutProps) => <Layout {...props} menu={AdminAppMenu} />;
