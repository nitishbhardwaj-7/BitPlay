import React, { createContext, useContext, useEffect, useState } from "react";
import { Platform } from "react-native";
import DeviceInfo from "react-native-device-info";
import { get_data_uri } from "../config/api";
import { SplashContent } from "../screens/SplashScreen";

type AdConfig = {
  rewardedVideoId: string | null;
  homeBannerId: string | null;
  gamRewardedVideoId: string | null;
  gamHomeBannerId: string | null;
};

type AdConfigContextType = {
  ads: AdConfig;
  loading: boolean;
};

const AdConfigContext = createContext<AdConfigContextType | undefined>(
  undefined
);

export const AdConfigProvider = ({ children }: { children: React.ReactNode }) => {
  const [ads, setAds] = useState<AdConfig>({
    rewardedVideoId: null,
    homeBannerId: null,
    gamRewardedVideoId: null,
    gamHomeBannerId: null,
  });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const init = async () => {
      try {
        // detect prod vs dev/test
        const isEmulator = await DeviceInfo.isEmulator();
        const isTestDevice = __DEV__ || isEmulator;
        const production = !isTestDevice;

        const res = await fetch(
          `${get_data_uri("GOOGLE_ADS_IDS")}?production=${production}`
        );
        if (!res.ok) throw new Error(`Failed: ${res.status}`);
        const data = await res.json();

        console.log("data: ", data);

        let rewardedVideoId: string | null = null;
        let homeBannerId: string | null = null;
        let gamRewardedVideoId: string | null = null;
        let gamHomeBannerId: string | null = null;

        if (data.success && data.ads) {
          const platformAds = Platform.OS === 'android' ? data.ads.android : data.ads.ios;
          console.log("platformAds: ", platformAds);

          if (platformAds) {
            rewardedVideoId = platformAds.rewardedVideoId ?? null;
            homeBannerId = platformAds.homeBannerId ?? null;
            gamRewardedVideoId = platformAds.gamRewardedVideoId ?? null;
            gamHomeBannerId = platformAds.gamHomeBannerId ?? null;
          }
        }

        setAds({
          rewardedVideoId,
          homeBannerId,
          gamRewardedVideoId,
          gamHomeBannerId,
        });

      } catch (err) {
        console.error("AdConfig error:", err);
      } finally {
        setLoading(false);
      }
    };

    init();
  }, []);

  if (loading) {
    return <SplashContent showLoader={false} />;
  }

  return (
    <AdConfigContext.Provider value={{ ads, loading }}>
      {children}
    </AdConfigContext.Provider>
  );
};

export const useAdConfig = () => {
  const context = useContext(AdConfigContext);
  if (!context) {
    throw new Error("useAdConfig must be used within AdConfigProvider");
  }
  return context;
};
