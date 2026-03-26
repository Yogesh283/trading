import DashboardIcon from "@mui/icons-material/Dashboard";
import type { LayoutProps } from "react-admin";
import { Layout, Menu, MenuItemLink } from "react-admin";

/** Dashboard first so the home view is obvious; resources follow (see main.tsx). */
export const AdminAppMenu = () => (
  <Menu>
    <MenuItemLink to="/" primaryText="Dashboard" leftIcon={<DashboardIcon />} />
    <Menu.ResourceItems />
  </Menu>
);

export const AdminAppLayout = (props: LayoutProps) => <Layout {...props} menu={AdminAppMenu} />;
