import React, { useEffect } from 'react';
import { View, Text, StyleSheet, Platform } from 'react-native';
import Animated, {
    useSharedValue,
    useAnimatedStyle,
    withTiming,
    Easing,
} from 'react-native-reanimated';

const DIGIT_HEIGHT = 22;
const ANIMATION_DURATION = 800;

const DIGITS = ['0', '1', '2', '3', '4', '5', '6', '7', '8', '9', '.', ' '];

interface OdometerDigitProps {
    digit: string;
}

const OdometerDigit: React.FC<OdometerDigitProps> = ({ digit }) => {
    const initialIndex = Math.max(0, DIGITS.indexOf(digit));
    // Start at the correct position immediately — no flash of '0' on first render
    const translateY = useSharedValue(-initialIndex * DIGIT_HEIGHT);

    useEffect(() => {
        const index = DIGITS.indexOf(digit);
        if (index !== -1) {
            translateY.value = withTiming(-index * DIGIT_HEIGHT, {
                duration: ANIMATION_DURATION,
                easing: Easing.out(Easing.cubic),
            });
        }
    }, [digit]);

    const animatedStyle = useAnimatedStyle(() => ({
        transform: [{ translateY: translateY.value }],
    }));

    return (
        <View style={styles.digitContainer}>
            <Animated.View style={[styles.digitScroll, animatedStyle]}>
                {DIGITS.map((d, i) => (
                    <Text key={i} style={styles.digitText}>
                        {d}
                    </Text>
                ))}
            </Animated.View>
        </View>
    );
};

interface OdometerCounterProps {
    value: number;
}

const OdometerCounter: React.FC<OdometerCounterProps> = ({ value }) => {
    // 10 decimal places, strip trailing zeros beyond the 8th (satoshi precision)
    const raw = value.toFixed(10);
    const trimmed = raw.replace(/(\.\d{8})0+$/, '$1');
    const characters = trimmed.split('');

    return (
        <View style={styles.outerRow}>
            <View style={styles.container}>
                {characters.map((char, index) => (
                    <View key={index} style={styles.digitWrapper}>
                        <OdometerDigit digit={char} />
                    </View>
                ))}
            </View>
            {/* BTC rendered as plain Text — always visible from frame 1, never clips */}
            <Text style={styles.btcLabel}> BTC</Text>
        </View>
    );
};

const styles = StyleSheet.create({
    outerRow: {
        flexDirection: 'row',
        alignItems: 'center',
    },
    container: {
        flexDirection: 'row',
        alignItems: 'center',
    },
    digitWrapper: {
        height: DIGIT_HEIGHT,
        width: 10.5,
        overflow: 'hidden',
    },
    digitContainer: {
        height: DIGIT_HEIGHT,
        width: '100%',
        overflow: 'hidden',
        alignItems: 'center',
        justifyContent: 'flex-start',
    },
    digitScroll: {
        flexDirection: 'column',
    },
    digitText: {
        fontSize: 16,
        fontWeight: '400',
        color: '#FFFFFF',
        height: DIGIT_HEIGHT,
        lineHeight: DIGIT_HEIGHT,
        textAlign: 'center',
        fontVariant: ['tabular-nums'],
        fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
    },
    btcLabel: {
        fontSize: 16,
        fontWeight: '600',
        color: '#FFFFFF',
        fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
    },
});

export default OdometerCounter;
